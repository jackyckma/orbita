import type {
  AutopilotTask,
  GithubCommit,
  HubReportSection,
  HubRepoReport,
  NormalizeRepoReportInput,
} from "./types.js";

const SECTION_TITLES = {
  intent_vs_actual: "Intent vs last period",
  shipped: "Shipped / merged",
  needs_founder: "Blocked / needs founder",
  autopilot: "Autopilot health",
  risks: "Risks / drift",
  ask: "Ask",
} as const;

const TASK_ID_RE = /\bT-\d{4}\b/g;

export function extractTaskIds(text: string): string[] {
  const found = text.match(TASK_ID_RE) ?? [];
  return [...new Set(found)];
}

function section(
  id: keyof typeof SECTION_TITLES,
  body: string,
): HubReportSection {
  return { id, title: SECTION_TITLES[id], body: body.trim() || "none" };
}

function countByStatus(tasks: AutopilotTask[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const task of tasks) {
    const status = (task.status ?? "unknown").trim() || "unknown";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

function formatShipped(commits: GithubCommit[]): string {
  if (commits.length === 0) return "none";
  const lines = commits.slice(0, 40).map((c) => {
    const ids = extractTaskIds(c.message);
    const idPart = ids.length ? ` [${ids.join(", ")}]` : "";
    const firstLine = c.message.split("\n")[0]?.trim() ?? c.sha.slice(0, 7);
    return `- ${c.sha.slice(0, 7)}${idPart}: ${firstLine}`;
  });
  if (commits.length > 40) {
    lines.push(`- …and ${commits.length - 40} more commits`);
  }
  return lines.join("\n");
}

function formatIntentVsActual(
  previousAsk: string | null,
  commits: GithubCommit[],
): string {
  if (!previousAsk || previousAsk === "none") return "none";
  const shippedIds = new Set(
    commits.flatMap((c) => extractTaskIds(c.message)),
  );
  const askIds = extractTaskIds(previousAsk);
  if (askIds.length === 0) {
    return `Previous ask: ${previousAsk}\nShipped this period: ${commits.length} commit(s).`;
  }
  const hit = askIds.filter((id) => shippedIds.has(id));
  const miss = askIds.filter((id) => !shippedIds.has(id));
  const parts = [`Previous ask: ${previousAsk}`];
  if (hit.length) parts.push(`Matched in shipped commits: ${hit.join(", ")}`);
  if (miss.length) parts.push(`Not seen in shipped commits: ${miss.join(", ")}`);
  return parts.join("\n");
}

function formatNeedsFounder(
  tasks: AutopilotTask[],
  decisions: { id?: string; status?: string; title?: string }[],
): string {
  const lines: string[] = [];
  for (const task of tasks.filter((t) => t.status === "needs_human")) {
    lines.push(
      `- ${task.id ?? "?"}: ${task.title ?? "(no title)"} — needs founder judgment`,
    );
  }
  for (const d of decisions.filter(
    (x) => x.status === "open" || x.status === "proposed",
  )) {
    lines.push(
      `- decision ${d.id ?? "?"}: ${d.title ?? "(untitled)"} (status=${d.status})`,
    );
  }
  return lines.length ? lines.join("\n") : "none";
}

function formatAutopilot(
  tasks: AutopilotTask[],
  locks: Record<string, unknown> | undefined,
  pauseState: Record<string, unknown> | null,
): string {
  const counts = countByStatus(tasks);
  const countLine =
    Object.keys(counts).length === 0
      ? "tasks: (none)"
      : `tasks by status: ${Object.entries(counts)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")}`;
  const lockKeys = locks ? Object.keys(locks) : [];
  const lockLine =
    lockKeys.length === 0
      ? "locks: none"
      : `locks held: ${lockKeys.join(", ")}`;
  const paused =
    pauseState &&
    (pauseState.paused === true ||
      (typeof pauseState.paused === "object" && pauseState.paused !== null));
  // pause-state.json shapes vary; also treat non-empty pause without paused:false as set
  const pauseSet =
    pauseState != null &&
    (paused ||
      (pauseState.by != null && pauseState.paused !== false) ||
      (typeof pauseState.reason === "string" && pauseState.reason.length > 0));
  const pauseLine = pauseSet
    ? `pause-state: set${pauseState?.by ? ` (by=${String(pauseState.by)})` : ""}`
    : "pause-state: clear";
  return [countLine, lockLine, pauseLine].join("\n");
}

function formatRisks(
  tasks: AutopilotTask[],
  readyStaleMs: number,
  nowMs: number,
): string {
  const lines: string[] = [];
  for (const task of tasks) {
    if ((task.retries ?? 0) > 0) {
      lines.push(
        `- ${task.id ?? "?"}: retries=${task.retries} (status=${task.status ?? "?"})`,
      );
    }
  }
  // Ready tasks with no feedback and no signal of recent touch → soft staleness.
  // Backlog tasks lack updated_at; use empty feedback as "untouched" proxy when ready.
  for (const task of tasks) {
    if (task.status !== "ready") continue;
    const feedback = Array.isArray(task.feedback) ? task.feedback : [];
    if (feedback.length > 0) continue;
    // Without timestamps, flag ready+untouched when readyStaleMs > 0 as caution list
    // (collector period itself is the observation window; list them for hub attention).
    if (readyStaleMs > 0) {
      lines.push(
        `- ${task.id ?? "?"}: ready with empty feedback (possible stall; window=${Math.round(readyStaleMs / 3600000)}h)`,
      );
    }
  }
  void nowMs;
  return lines.length ? lines.join("\n") : "none";
}

function formatAsk(
  tasks: AutopilotTask[],
  decisions: { id?: string; status?: string; title?: string }[],
): string {
  const needsHuman = tasks.filter((t) => t.status === "needs_human");
  if (needsHuman[0]) {
    const t = needsHuman[0];
    return `Unblock ${t.id ?? "task"}: ${t.title ?? "needs_human item"}`;
  }
  const open = decisions.find(
    (d) => d.status === "open" || d.status === "proposed",
  );
  if (open) {
    return `Decide ${open.id ?? "decision"}: ${open.title ?? "open decision"}`;
  }
  const retry = tasks.find((t) => (t.retries ?? 0) > 0);
  if (retry) {
    return `Investigate retries on ${retry.id ?? "task"}: ${retry.title ?? ""}`.trim();
  }
  return "none";
}

/**
 * Pure normaliser: turns already-fetched autopilot files + commits into a hub report.
 * No network I/O.
 */
export function normalizeRepoReport(
  input: NormalizeRepoReportInput,
): HubRepoReport {
  if (input.fetchError) {
    return {
      schema_version: "1.1",
      edge: "repo",
      project: input.project,
      generated_at: input.generatedAt,
      period: input.period,
      status: "failed",
      source_sha: input.sourceSha,
      error: input.fetchError,
      sections: [
        section("intent_vs_actual", "none"),
        section("shipped", "none"),
        section("needs_founder", "none"),
        section("autopilot", "none"),
        section("risks", input.fetchError),
        section("ask", "Restore GitHub read access for this registered project"),
      ],
    };
  }

  const tasks = input.files.backlog?.tasks ?? [];
  const decisions = input.files.decisions?.decisions ?? [];
  const locks = input.files.locks?.locks;
  const readyStaleMs = input.readyStaleMs ?? 7 * 24 * 3600 * 1000;
  const nowMs = input.nowMs ?? Date.now();

  const sections: HubReportSection[] = [
    section(
      "intent_vs_actual",
      formatIntentVsActual(input.previousAsk, input.commits),
    ),
    section("shipped", formatShipped(input.commits)),
    section("needs_founder", formatNeedsFounder(tasks, decisions)),
    section(
      "autopilot",
      formatAutopilot(tasks, locks, input.files.pauseState),
    ),
    section("risks", formatRisks(tasks, readyStaleMs, nowMs)),
    section("ask", formatAsk(tasks, decisions)),
  ];

  const degraded =
    input.files.backlog == null ||
    input.files.missingOptional.includes("docs/autopilot/backlog.json");

  return {
    schema_version: "1.1",
    edge: "repo",
    project: input.project,
    generated_at: input.generatedAt,
    period: input.period,
    status: degraded ? "degraded" : "ok",
    source_sha: input.sourceSha,
    sections,
  };
}

export function reportToNoteBody(report: HubRepoReport): string {
  const lines = [
    `# Repo report — ${report.project}`,
    "",
    `- schema_version: ${report.schema_version}`,
    `- edge: ${report.edge}`,
    `- status: ${report.status}`,
    `- source_sha: ${report.source_sha ?? "null"}`,
    `- period: ${report.period.since} → ${report.period.until}`,
    "",
  ];
  if (report.error) {
    lines.push(`**Error:** ${report.error}`, "");
  }
  for (const s of report.sections) {
    lines.push(`## ${s.title}`, "", s.body, "");
  }
  lines.push("<!-- orbita-hub-report-json");
  lines.push(JSON.stringify(report));
  lines.push("-->");
  return lines.join("\n");
}
