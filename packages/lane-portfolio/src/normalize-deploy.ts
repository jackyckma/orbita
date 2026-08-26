import type {
  HubDeployReport,
  HubReportSection,
  NormalizeDeployReportInput,
  ZeaburDeployment,
} from "./types.js";

const SECTION_TITLES = {
  intent_vs_actual: "Intent vs last period",
  shipped: "Shipped / merged",
  needs_founder: "Blocked / needs founder",
  autopilot: "Autopilot health",
  risks: "Risks / drift",
  ask: "Ask",
} as const;

function section(
  id: keyof typeof SECTION_TITLES,
  body: string,
): HubReportSection {
  return { id, title: SECTION_TITLES[id], body: body.trim() || "none" };
}

const FAILED = new Set(["FAILED", "CRASHED", "ERROR"]);
const RUNNING_OK = new Set(["RUNNING", "SUCCESS", "SUCCEEDED"]);

export function isFailedDeployStatus(status: string): boolean {
  return FAILED.has(status.toUpperCase());
}

export function isOkDeployStatus(status: string): boolean {
  return RUNNING_OK.has(status.toUpperCase());
}

function shortSha(sha: string): string {
  const s = sha.trim();
  if (!s) return "(no sha)";
  return s.length > 12 ? s.slice(0, 7) : s;
}

function formatDeployLine(d: ZeaburDeployment): string {
  const sha = d.commitSha?.trim()
    ? shortSha(d.commitSha)
    : "sha=unavailable (timestamp correlation only)";
  const when = d.finishedAt ?? d.startedAt ?? d.createdAt ?? "?";
  return `- ${d.serviceName}/${d.environmentName} ${d.status} ${sha} @ ${when} (${d.id})`;
}

function pickSourceSha(deployments: ZeaburDeployment[]): {
  source_sha: string | null;
  sha_confidence: HubDeployReport["sha_confidence"];
} {
  for (const d of deployments) {
    const sha = d.commitSha?.trim();
    if (sha) return { source_sha: sha, sha_confidence: "commit" };
  }
  if (deployments.length > 0) {
    return { source_sha: null, sha_confidence: "timestamp" };
  }
  return { source_sha: null, sha_confidence: "none" };
}

function formatIntent(
  previousAsk: string | null,
  deployments: ZeaburDeployment[],
): string {
  if (!previousAsk || previousAsk === "none") return "none";
  const shas = deployments
    .map((d) => d.commitSha?.trim())
    .filter(Boolean) as string[];
  return [
    `Previous ask: ${previousAsk}`,
    `Deployments this period: ${deployments.length}`,
    shas.length
      ? `Commit SHAs seen: ${[...new Set(shas)].map(shortSha).join(", ")}`
      : "No commitSHA on deployments — join to git line is timestamp-only (lower confidence).",
  ].join("\n");
}

function formatShipped(deployments: ZeaburDeployment[]): string {
  const ok = deployments.filter((d) => isOkDeployStatus(d.status));
  if (ok.length === 0) return "none";
  return ok.map(formatDeployLine).join("\n");
}

function formatNeedsFounder(
  deployments: ZeaburDeployment[],
  failedBuildLogs: Record<string, string>,
): string {
  const failed = deployments.filter((d) => isFailedDeployStatus(d.status));
  if (failed.length === 0) return "none";
  const lines: string[] = [
    "Failed deployments may leave production on an older successful build — Checker WATCHDOG can still PASS against stale traffic.",
  ];
  for (const d of failed) {
    lines.push(formatDeployLine(d));
    const log = failedBuildLogs[d.id]?.trim();
    if (log) {
      lines.push(`  build log (tail): ${log.slice(0, 400)}`);
    }
  }
  return lines.join("\n");
}

function formatAutopilot(
  deployments: ZeaburDeployment[],
  zeaburProjectName: string | null | undefined,
): string {
  const counts: Record<string, number> = {};
  for (const d of deployments) {
    const s = d.status || "UNKNOWN";
    counts[s] = (counts[s] ?? 0) + 1;
  }
  const countLine =
    Object.keys(counts).length === 0
      ? "deployments in period: none"
      : `deployments by status: ${Object.entries(counts)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")}`;
  const nameLine = zeaburProjectName
    ? `zeabur project: ${zeaburProjectName}`
    : "zeabur project: (unmatched)";
  const shaMissing = deployments.filter((d) => !d.commitSha?.trim()).length;
  const shaLine =
    shaMissing === 0
      ? "commitSHA: present on all rows"
      : `commitSHA missing on ${shaMissing}/${deployments.length} row(s) — timestamp fallback`;
  return [nameLine, countLine, shaLine].join("\n");
}

function formatRisks(
  deployments: ZeaburDeployment[],
  failedBuildLogs: Record<string, string>,
): string {
  const lines: string[] = [];
  for (const d of deployments.filter((x) => isFailedDeployStatus(x.status))) {
    lines.push(formatDeployLine(d));
    const log = failedBuildLogs[d.id]?.trim();
    if (log) lines.push(`  ${log.slice(0, 240)}`);
  }
  const inFlight = deployments.filter((d) =>
    ["BUILDING", "DEPLOYING"].includes(d.status.toUpperCase()),
  );
  for (const d of inFlight) {
    lines.push(`in-flight: ${formatDeployLine(d)}`);
  }
  return lines.length ? lines.join("\n") : "none";
}

function formatAsk(deployments: ZeaburDeployment[]): string {
  const failed = deployments.filter((d) => isFailedDeployStatus(d.status));
  if (failed[0]) {
    const d = failed[0];
    return `Investigate failed deploy ${d.serviceName} (${shortSha(d.commitSha || d.id)}) — production may still serve the previous build`;
  }
  const missingSha = deployments.filter((d) => !d.commitSha?.trim());
  if (missingSha.length && deployments.length) {
    return "Confirm Zeabur commitSHA exposure for git↔deploy joins (currently timestamp-only)";
  }
  return "none";
}

/**
 * Pure normaliser: turns already-fetched Zeabur deployments into a hub deploy report.
 */
export function normalizeDeployReport(
  input: NormalizeDeployReportInput,
): HubDeployReport {
  if (input.fetchError) {
    return {
      schema_version: "1.1",
      edge: "deploy",
      project: input.project,
      generated_at: input.generatedAt,
      period: input.period,
      status: "failed",
      source_sha: null,
      sha_confidence: "none",
      error: input.fetchError,
      sections: [
        section("intent_vs_actual", "none"),
        section("shipped", "none"),
        section("needs_founder", "none"),
        section("autopilot", "none"),
        section("risks", input.fetchError),
        section(
          "ask",
          "Restore Zeabur API access (credential zeabur_api) for personal-jacky",
        ),
      ],
    };
  }

  const { source_sha, sha_confidence } = pickSourceSha(input.deployments);
  const failed = input.deployments.filter((d) => isFailedDeployStatus(d.status));
  const status =
    failed.length > 0
      ? "degraded"
      : input.deployments.length === 0
        ? "degraded"
        : "ok";

  return {
    schema_version: "1.1",
    edge: "deploy",
    project: input.project,
    generated_at: input.generatedAt,
    period: input.period,
    status,
    source_sha,
    sha_confidence,
    sections: [
      section(
        "intent_vs_actual",
        formatIntent(input.previousAsk, input.deployments),
      ),
      section("shipped", formatShipped(input.deployments)),
      section(
        "needs_founder",
        formatNeedsFounder(input.deployments, input.failedBuildLogs),
      ),
      section(
        "autopilot",
        formatAutopilot(input.deployments, input.zeaburProjectName),
      ),
      section("risks", formatRisks(input.deployments, input.failedBuildLogs)),
      section("ask", formatAsk(input.deployments)),
    ],
  };
}

export function deployReportToNoteBody(report: HubDeployReport): string {
  const lines = [
    `# Deploy report — ${report.project}`,
    "",
    `- schema_version: ${report.schema_version}`,
    `- edge: ${report.edge}`,
    `- status: ${report.status}`,
    `- source_sha: ${report.source_sha ?? "null"}`,
    `- sha_confidence: ${report.sha_confidence}`,
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
