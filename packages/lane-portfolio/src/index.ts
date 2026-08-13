export type {
  AutopilotBacklog,
  AutopilotLocks,
  AutopilotPauseState,
  AutopilotTask,
  FetchedAutopilotFiles,
  GithubCommit,
  HubRepoReport,
  HubReportSection,
  NormalizeRepoReportInput,
  PortfolioProject,
  PortfolioRegistry,
  ReportPeriod,
  ReportStatus,
} from "./types.js";

export {
  extractTaskIds,
  normalizeRepoReport,
  reportToNoteBody,
} from "./normalize.js";

export {
  enabledPortfolioProjects,
  isLikelyPrivateRepo,
  loadPortfolioRegistry,
  resolvePortfolioRegistryPath,
} from "./registry.js";

export {
  fetchProjectAutopilotFromGithub,
  type GithubFetchResult,
  type GithubFetcherDeps,
} from "./github.js";

export {
  collectPortfolioGitReports,
  defaultCollectPeriod,
  type CollectPortfolioGitOptions,
  type CollectPortfolioGitResult,
  type NoteWriter,
  type PreviousAskLookup,
} from "./collect.js";
