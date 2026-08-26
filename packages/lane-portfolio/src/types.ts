/** Hub report shape — portfolio-hub.md + schema_version 1.1 */

export type ReportPeriod = {
  since: string;
  until: string;
};

export type ReportStatus = "ok" | "degraded" | "failed";

export type HubReportSectionId =
  | "intent_vs_actual"
  | "shipped"
  | "needs_founder"
  | "autopilot"
  | "risks"
  | "ask";

export type HubReportSection = {
  id: HubReportSectionId;
  title: string;
  body: string;
};

export type HubReportEdge = "repo" | "deploy" | "runtime";

export type HubRepoReport = {
  schema_version: "1.1";
  edge: "repo";
  project: string;
  generated_at: string;
  period: ReportPeriod;
  status: ReportStatus;
  source_sha: string | null;
  sections: HubReportSection[];
  error?: string;
};

export type HubDeployReport = {
  schema_version: "1.1";
  edge: "deploy";
  project: string;
  generated_at: string;
  period: ReportPeriod;
  status: ReportStatus;
  /** Commit SHA used to join deploy ↔ git lines; null if Zeabur omitted it. */
  source_sha: string | null;
  /** true when source_sha came from commitSHA; false when falling back to timestamps. */
  sha_confidence: "commit" | "timestamp" | "none";
  sections: HubReportSection[];
  error?: string;
};

export type PortfolioProject = {
  slug: string;
  display_name: string;
  github: string;
  github_default_branch: string;
  zeabur_project_name: string | null;
  runtime_report_url: string | null;
  expected_cadence_hours: number;
  enabled: boolean;
  notes?: string;
};

export type PortfolioRegistry = {
  _doc?: string;
  projects: PortfolioProject[];
};

export type AutopilotTask = {
  id?: string;
  title?: string;
  status?: string;
  retries?: number;
  feedback?: unknown[];
};

export type AutopilotBacklog = {
  tasks?: AutopilotTask[];
};

export type AutopilotLocks = {
  locks?: Record<string, { by?: string; since?: string; branch?: string | null; pr?: number | null }>;
};

export type AutopilotPauseState = {
  paused?: boolean;
  by?: string;
  reason?: string;
  [key: string]: unknown;
};

export type AutopilotDecision = {
  id?: string;
  status?: string;
  title?: string;
};

export type AutopilotDecisionsFile = {
  decisions?: AutopilotDecision[];
};

export type GithubCommit = {
  sha: string;
  message: string;
  date: string | null;
};

export type FetchedAutopilotFiles = {
  backlog: AutopilotBacklog | null;
  roadmap: unknown | null;
  locks: AutopilotLocks | null;
  pauseState: AutopilotPauseState | null;
  decisions: AutopilotDecisionsFile | null;
  latestReport: unknown | null;
  /** Missing optional files (not failures). */
  missingOptional: string[];
};

export type NormalizeRepoReportInput = {
  project: string;
  period: ReportPeriod;
  generatedAt: string;
  sourceSha: string | null;
  files: FetchedAutopilotFiles;
  commits: GithubCommit[];
  /** Previous period report's ask body, if any. */
  previousAsk: string | null;
  /** Hard failure (e.g. private repo 404 / no access). */
  fetchError?: string | null;
  /** Ready tasks older than this many ms without feedback → risk (default 7d). */
  readyStaleMs?: number;
  nowMs?: number;
};

/** One Zeabur deployment row (fields from zeabur/cli pkg/model/deployment.go). */
export type ZeaburDeployment = {
  id: string;
  projectId: string;
  serviceId: string;
  serviceName: string;
  environmentId: string;
  environmentName: string;
  status: string;
  commitSha: string;
  commitMessage: string;
  repoName: string;
  ref: string;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type NormalizeDeployReportInput = {
  project: string;
  period: ReportPeriod;
  generatedAt: string;
  deployments: ZeaburDeployment[];
  /** Truncated build-log snippets keyed by deployment id (failed only). */
  failedBuildLogs: Record<string, string>;
  previousAsk: string | null;
  fetchError?: string | null;
  /** Project matched on Zeabur by name. */
  zeaburProjectId?: string | null;
  zeaburProjectName?: string | null;
};
