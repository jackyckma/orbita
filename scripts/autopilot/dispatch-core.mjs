// Pure decision logic for the autopilot 2-lane dispatcher (Maker / Checker).
// No IO here — callers gather state and pass it in, so this is unit-testable.
//
// The whole point: "deciding what to do this tick" is DETERMINISTIC (here),
// and the LLM only EXECUTES the returned action per the playbook. This keeps
// the loop predictable and debuggable.
//
// Invariant preserved by design: the Maker lane never merges; the Checker lane
// never writes feature code. Independence of review comes from each cron tick
// being a fresh agent run doing exactly ONE action.

/**
 * @typedef {Object} Task
 * @property {string} id
 * @property {string} status   ready|in_progress|in_review|blocked|done|needs_human
 * @property {string[]} [deps]
 * @property {number} [retries]
 */

/**
 * @typedef {Object} OpenPR
 * @property {number} number
 * @property {string} branch
 * @property {boolean} [isDraft]
 * @property {string} [title]
 */

/** @param {string|null|undefined} title */
export function extractAutopilotTaskId(title) {
  const m = String(title ?? "").match(/\bT-\d{4}\b/);
  return m ? m[0] : null;
}

/**
 * Normalise a PR reference to a number.
 *
 * `locks.json` lease.pr is written by the Maker, and the playbook did not
 * originally pin its format — in practice agents have written all three of
 * `609`, `"609"` and `"https://github.com/owner/repo/pull/609"`. Accept all.
 *
 * @param {unknown} value
 * @returns {number|null} the PR number, or null if it cannot be determined
 */
export function parsePrNumber(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isInteger(value) ? value : null;
  const text = String(value).trim();
  if (text === "") return null;
  if (/^\d+$/.test(text)) return Number(text);
  const fromUrl = text.match(/\/pull\/(\d+)/);
  if (fromUrl) return Number(fromUrl[1]);
  const bareHash = text.match(/^#(\d+)$/);
  if (bareHash) return Number(bareHash[1]);
  return null;
}

/**
 * A PR is stale when its task is already done on main, or main's locks.json
 * leases a *different* PR for the same task id (duplicate Maker run).
 *
 * SAFETY RULE: if the lease exists but its PR reference cannot be parsed, this
 * returns FALSE — "unknown" must never be read as "superseded". Closing a
 * healthy PR is destructive and cannot be undone by the loop; sending it to
 * REVIEW instead costs one tick. A previous version did `Number(lease.pr)`,
 * which yields NaN for a URL, and `NaN !== 6` is true — so every oldest PR
 * looked superseded, CLOSE_STALE was proposed ahead of REVIEW on every tick,
 * the Checker agent correctly refused at the playbook gate, and the lane
 * deadlocked with PRs accumulating for days. (This is the incident referenced
 * in orbita's pause-state.json _last_incident, 2026-08-09.)
 *
 * @param {OpenPR} pr
 * @param {{ tasksById: Map<string, Task>, locks?: Record<string, { pr?: number|string|null }> }} ctx
 */
export function isPrSuperseded(pr, ctx) {
  const taskId = extractAutopilotTaskId(pr.title);
  if (!taskId) return false;
  const task = ctx.tasksById.get(taskId);
  if (task?.status === "done") return true;

  const lease = ctx.locks?.[taskId];
  if (lease == null || lease.pr == null) return false;

  const leasedPr = parsePrNumber(lease.pr);
  if (leasedPr == null) return false; // unparseable → not a superseded signal
  const thisPr = parsePrNumber(pr.number);
  if (thisPr == null) return false;

  return leasedPr !== thisPr;
}

/**
 * Age of a lock in hours, or null if `since` is missing/unparseable.
 * Unparseable/missing must never be read as "stale" or "fresh" — null lets
 * the caller skip it, same safety posture as parsePrNumber above.
 * @param {string|null|undefined} since
 * @param {number} nowMs
 */
export function lockAgeHours(since, nowMs) {
  if (!since) return null;
  const t = Date.parse(String(since));
  if (Number.isNaN(t)) return null;
  return (nowMs - t) / 3_600_000;
}

/**
 * STALL SAFETY NET.
 *
 * A lock's `since` timestamp is written once, when Maker first leases a task
 * on main — before it branches, before it implements, before anything that
 * could crash. Under normal operation a task moves out of the state matching
 * `statusMatch` within one tick (minutes). If it hasn't after `staleHours`,
 * that is not "still working" — a normal IMPLEMENT or REVIEW run does not take
 * hours — it means every run that picked up this lock crashed or errored
 * before it could reach the playbook's own bounce-to-ready / bounce-to-
 * needs_human step. The agent-side retry/needs_human bookkeeping in
 * backlog.json never got a chance to fire, so without this check the same
 * lock gets silently re-picked (or silently ignored) forever.
 *
 * This reuses `locks.json.since`, which already exists for a different
 * purpose (lease bookkeeping) — no new persisted counters, no extra commits
 * on the happy path. Only fires (and only then does the caller write
 * anything) once a lock has actually been stuck past the threshold.
 *
 * @param {Record<string, {since?: string, pr?: number|string|null}>} locks
 * @param {Map<string, Task>} tasksById
 * @param {{ nowMs: number, staleHours?: number, statusMatch: string }} opts
 * @returns {{ taskId: string, since: string, ageHours: number, pr: number|null } | null}
 *   The single oldest offending lock, or null if none qualify.
 */
export function findStaleLock(locks, tasksById, opts) {
  const staleHours = opts.staleHours ?? 4;
  let worst = null;
  for (const [taskId, lease] of Object.entries(locks ?? {})) {
    const task = tasksById.get(taskId);
    if (!task || task.status !== opts.statusMatch) continue;
    const age = lockAgeHours(lease?.since, opts.nowMs);
    if (age == null || age < staleHours) continue;
    if (!worst || age > worst.ageHours) {
      worst = { taskId, since: lease.since, ageHours: age, pr: parsePrNumber(lease?.pr ?? null) };
    }
  }
  return worst;
}

/**
 * Decide the single Maker action for this tick.
 * @param {{
 *   paused:boolean,
 *   tasks:Task[],
 *   readyMin:number,
 *   hasUndecomposedApprovedEpic:boolean,
 *   lockedTaskIds?: string[],
 *   locks?: Record<string, { since?: string, pr?: number|string|null }>,
 *   nowMs?: number,
 *   staleLockHours?: number,
 * }} state
 */
export function decideMaker(state) {
  const lane = "maker";
  if (state.paused) {
    return { lane, action: "IDLE", reason: "loop paused; Maker holds" };
  }

  const tasksById = new Map(state.tasks.map((t) => [t.id, t]));

  // Checked first, ahead of picking new work: a stuck lease blocks nothing in
  // actionableReady (it's already excluded there), so without this check it
  // would just sit invisible forever rather than surfacing to the founder.
  // (Checker also runs this same check on 'in_progress' locks — see
  // decideChecker below — because on projects where Maker only ticks once or
  // twice a day, Checker's much more frequent ticks catch a Maker-side stall
  // far sooner. This check stays here too so Maker self-heals even on a
  // project with no Checker traffic at all.)
  const stale = findStaleLock(state.locks ?? {}, tasksById, {
    nowMs: state.nowMs ?? Date.now(),
    staleHours: state.staleLockHours,
    statusMatch: "in_progress",
  });
  if (stale) {
    return {
      lane,
      action: "FORCE_NEEDS_HUMAN",
      taskId: stale.taskId,
      ageHours: stale.ageHours,
      reason: `lock held ${stale.ageHours.toFixed(1)}h with task still in_progress — normal IMPLEMENT finishes in one tick, so every run since must have crashed before it could bounce itself. Escalating instead of retrying blind.`,
    };
  }

  const locked = new Set(state.lockedTaskIds ?? []);
  const doneIds = new Set(state.tasks.filter((t) => t.status === "done").map((t) => t.id));
  const actionableReady = state.tasks.filter(
    (t) =>
      t.status === "ready" &&
      !locked.has(t.id) &&
      (t.deps ?? []).every((d) => doneIds.has(d)),
  );

  // Fix-first: a task the Checker bounced back to ready (retries>0) beats fresh work.
  const bounced = actionableReady.find((t) => (t.retries ?? 0) > 0);
  const pick = bounced ?? actionableReady[0];
  if (pick) {
    return {
      lane,
      action: "IMPLEMENT",
      taskId: pick.id,
      task: pick,
      reason: bounced ? "fix bounced task (retries>0)" : "next ready task, deps done",
    };
  }

  if (actionableReady.length < state.readyMin && state.hasUndecomposedApprovedEpic) {
    return { lane, action: "REPLAN", reason: "ready queue below READY_MIN; approved epic has scope to decompose" };
  }

  return { lane, action: "IDLE", reason: "no actionable ready task; nothing to replan" };
}

/**
 * Decide the single Checker action for this tick.
 * @param {{
 *   paused:boolean,
 *   pauseBy?: string|null,
 *   openPRs:OpenPR[],
 *   tasks?: Task[],
 *   locks?: Record<string, { since?: string, pr?: number|string|null }>,
 *   mainShaChanged:boolean,
 *   dailyReportDue:boolean,
 *   weeklyReportDue:boolean,
 *   nowMs?: number,
 *   staleLockHours?: number,
 * }} state
 */
export function decideChecker(state) {
  const lane = "checker";

  // Watchdog-set pause → recovery only. Founder/manual pause → full IDLE (do not
  // review/merge or clear the pause via a healthy smoke).
  if (state.paused) {
    if (state.pauseBy === "deploy-watchdog") {
      return { lane, action: "WATCHDOG", reason: "paused by watchdog — attempt prod recovery / clear pause" };
    }
    return { lane, action: "IDLE", reason: "paused (founder/manual); Checker holds" };
  }

  const tasksById = new Map((state.tasks ?? []).map((t) => [t.id, t]));
  const staleOpts = { nowMs: state.nowMs ?? Date.now(), staleHours: state.staleLockHours };

  // Checked first, ahead of picking a PR to review: if the head-of-queue PR's
  // REVIEW keeps failing before it can bounce itself, everything behind it in
  // the FIFO queue is blocked too — a silent head-of-line stall. Escalate and
  // let the PR-picking logic below skip it from here on (never merge on
  // failure, so the PR itself is left open, untouched, for manual inspection).
  const staleReview = findStaleLock(state.locks ?? {}, tasksById, { ...staleOpts, statusMatch: "in_review" });
  if (staleReview) {
    return {
      lane,
      action: "FORCE_NEEDS_HUMAN",
      taskId: staleReview.taskId,
      pr: staleReview.pr,
      ageHours: staleReview.ageHours,
      reason: `lock held ${staleReview.ageHours.toFixed(1)}h with task still in_review — REVIEW has been failing before it can bounce itself. Escalating; PR stays open and unmerged for manual inspection.`,
    };
  }

  // Checker also catches a MAKER-side stall (lock still in_progress), not
  // just its own. Rationale: Checker ticks far more often than Maker on most
  // projects — event-triggered on every new draft PR, plus its own schedule —
  // while Maker may only run once or twice a day. Waiting for Maker's own
  // next tick to notice its own crash could mean a stuck task sits for most
  // of a day. This does not blur "Checker never writes feature code": this
  // action only clears a lock and flips a status, the same escalation Maker
  // would have done to itself.
  const staleImplement = findStaleLock(state.locks ?? {}, tasksById, { ...staleOpts, statusMatch: "in_progress" });
  if (staleImplement) {
    return {
      lane,
      action: "FORCE_NEEDS_HUMAN",
      taskId: staleImplement.taskId,
      ageHours: staleImplement.ageHours,
      reason: `lock held ${staleImplement.ageHours.toFixed(1)}h with task still in_progress — normal IMPLEMENT finishes in one tick, so every run since must have crashed before it could bounce itself. Caught by Checker (ticks more often than Maker on this project) rather than waiting for Maker's own next scheduled run.`,
    };
  }

  if (Array.isArray(state.openPRs) && state.openPRs.length > 0) {
    const ctx = { tasksById, locks: state.locks ?? {} };

    // A PR whose task was already escalated (by either check above, this tick
    // or a previous one) has nothing left for this lane to do automatically —
    // skip it so later PRs in the queue still get a turn, rather than the
    // FIFO order re-picking the same stuck PR forever.
    const actionable = state.openPRs.filter((pr) => {
      const taskId = extractAutopilotTaskId(pr.title);
      const task = taskId ? tasksById.get(taskId) : null;
      return task?.status !== "needs_human";
    });

    // Drain duplicates/superseded PRs before spending a tick on verify-all (L-008).
    const stale = actionable.find((pr) => isPrSuperseded(pr, ctx));
    if (stale) {
      const taskId = extractAutopilotTaskId(stale.title);
      return {
        lane,
        action: "CLOSE_STALE",
        pr: stale.number,
        branch: stale.branch,
        taskId,
        reason: "superseded autopilot PR (task done or lease points at another PR)",
      };
    }

    const pr = actionable[0]; // oldest first (caller sorts)
    if (pr) {
      return {
        lane,
        action: "REVIEW",
        pr: pr.number,
        branch: pr.branch,
        reason: "open autopilot PR awaiting review",
      };
    }
    // Every open PR's task is already needs_human — nothing actionable here;
    // fall through to watchdog/report/idle below instead of returning early.
  }

  if (state.mainShaChanged) {
    return { lane, action: "WATCHDOG", reason: "main advanced since last prod check" };
  }

  if (state.weeklyReportDue) {
    return { lane, action: "REPORT", kind: "weekly", reason: "weekly review due" };
  }
  if (state.dailyReportDue) {
    return { lane, action: "REPORT", kind: "daily", reason: "no report yet today" };
  }

  return { lane, action: "IDLE", reason: "no open PRs, prod checked, reports current" };
}
