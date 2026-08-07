#!/usr/bin/env node
// Deterministic dispatcher for the autopilot 2-lane loop. No npm dependencies.
//
// Gathers blackboard state (backlog / roadmap / pause / open PRs / prod-check /
// reports) and asks dispatch-core for the ONE action this tick. The thin
// automation shell runs this, then executes the returned action per playbook.md.
//
// Usage:
//   node scripts/autopilot/decide-next-action.mjs --lane maker
//   node scripts/autopilot/decide-next-action.mjs --lane checker
//
// Prints a single JSON object: { lane, action, reason, ...payload }
// Exit 0 always; the caller reads stdout.

import { readFile, readdir, access } from "node:fs/promises";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { decideMaker, decideChecker } from "./dispatch-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ap = (p) => path.join(root, "docs", "autopilot", p);

const laneArg = (() => {
  const i = process.argv.indexOf("--lane");
  return i >= 0 ? process.argv[i + 1] : null;
})();
if (laneArg !== "maker" && laneArg !== "checker") {
  process.stdout.write(JSON.stringify({ action: "ERROR", reason: "pass --lane maker|checker" }) + "\n");
  process.exit(0);
}

async function loadJson(p, fallback) {
  try {
    return JSON.parse(await readFile(p, "utf8"));
  } catch {
    return fallback;
  }
}
async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}
function sh(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const pause = await loadJson(ap("pause-state.json"), { paused: false });
const paused = pause.paused === true;
const pauseBy = pause.by ?? null;

let result;

if (laneArg === "maker") {
  const backlog = await loadJson(ap("backlog.json"), { tasks: [] });
  const roadmap = await loadJson(ap("roadmap.json"), { epics: [] });
  const locksDoc = await loadJson(ap("locks.json"), { locks: {} });
  const tasks = backlog.tasks ?? [];
  const readyMin = Number.parseInt(process.env.READY_MIN ?? "2", 10);

  // An approved epic "has undecomposed scope" if it lists no tasks yet, or all
  // its referenced tasks are already done (so follow-ups may be needed).
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const hasUndecomposedApprovedEpic = (roadmap.epics ?? [])
    .filter((e) => e.status === "approved")
    .some((e) => {
      const refs = (e.decomposes_into ?? []).flatMap((ref) =>
        byId.has(ref) ? [byId.get(ref)] : tasks.filter((t) => t.id.startsWith(ref)),
      );
      return refs.length === 0 || refs.every((t) => t.status === "done");
    });

  // Active leases on main + any in_progress/in_review row (belt-and-suspenders).
  const lockedFromFile = Object.keys(locksDoc.locks ?? {}).filter((id) => {
    const t = byId.get(id);
    return !t || t.status !== "done";
  });
  const lockedFromStatus = tasks
    .filter((t) => t.status === "in_progress" || t.status === "in_review")
    .map((t) => t.id);
  const lockedTaskIds = [...new Set([...lockedFromFile, ...lockedFromStatus])];

  result = decideMaker({ paused, tasks, readyMin, hasUndecomposedApprovedEpic, lockedTaskIds });
} else {
  // checker
  let openPRs = [];
  // Checker auto-merges Maker task PRs + docs/report PRs, but NEVER Learner PRs:
  // Learner proposals change the loop's own governance and must be founder-gated,
  // so branches containing "learner" are excluded from the review/merge queue.
  const raw = sh(
    `gh pr list --state open --json number,title,headRefName,isDraft,createdAt --jq '[.[] | select((.headRefName | test("^cursor/")) and (.headRefName | test("learner") | not))] | sort_by(.createdAt)'`,
  );
  if (raw) {
    try {
      openPRs = JSON.parse(raw).map((p) => ({
        number: p.number,
        branch: p.headRefName,
        isDraft: p.isDraft,
        title: p.title,
      }));
    } catch {
      openPRs = [];
    }
  }

  const backlog = await loadJson(ap("backlog.json"), { tasks: [] });
  const locksDoc = await loadJson(ap("locks.json"), { locks: {} });

  const mainSha = sh("git rev-parse origin/main") || sh("git rev-parse HEAD");
  const watchState = await loadJson(ap("watchdog-state.json"), { last_checked_sha: null });
  const mainShaChanged = Boolean(mainSha) && mainSha !== watchState.last_checked_sha;

  const today = new Date().toISOString().slice(0, 10);
  const reportsDir = ap("reports");
  let reportFiles = [];
  if (await exists(reportsDir)) reportFiles = await readdir(reportsDir);
  const dailyReportDue = !reportFiles.includes(`${today}.md`);
  const isMonday = new Date().getUTCDay() === 1;
  const weeklyReportDue = isMonday && !reportFiles.includes(`weekly-${today}.md`);

  result = decideChecker({
    paused,
    pauseBy,
    openPRs,
    tasks: backlog.tasks ?? [],
    locks: locksDoc.locks ?? {},
    mainShaChanged,
    dailyReportDue,
    weeklyReportDue,
  });
}

process.stdout.write(JSON.stringify(result, null, 2) + "\n");
