export type {
  AutopilotBacklog,
  AutopilotLocks,
  AutopilotPauseState,
  AutopilotTask,
  FetchedAutopilotFiles,
  GithubCommit,
  HubDeployReport,
  HubRepoReport,
  HubReportEdge,
  HubReportSection,
  HubReportSectionId,
  NormalizeDeployReportInput,
  NormalizeRepoReportInput,
  PortfolioProject,
  PortfolioRegistry,
  ReportPeriod,
  ReportStatus,
  ZeaburDeployment,
} from "./types.js";

export {
  extractTaskIds,
  normalizeRepoReport,
  reportToNoteBody,
} from "./normalize.js";

export {
  deployReportToNoteBody,
  isFailedDeployStatus,
  isOkDeployStatus,
  normalizeDeployReport,
} from "./normalize-deploy.js";

export {
  enabledPortfolioProjects,
  isLikelyPrivateRepo,
  loadPortfolioRegistry,
  resolvePortfolioRegistryPath,
  zeaburPortfolioProjects,
} from "./registry.js";

export {
  fetchProjectAutopilotFromGithub,
  type GithubFetchResult,
  type GithubFetcherDeps,
} from "./github.js";

export {
  fetchZeaburDeploymentsForProject,
  Q_BUILD_LOGS,
  Q_DEPLOYMENTS,
  ZEABUR_GRAPHQL_URL,
  type FetchZeaburProjectResult,
  type ZeaburGraphqlDeps,
} from "./zeabur.js";

export {
  collectPortfolioGitReports,
  defaultCollectPeriod,
  type CollectPortfolioGitOptions,
  type CollectPortfolioGitResult,
  type NoteWriter,
  type PreviousAskLookup,
} from "./collect.js";

export {
  collectPortfolioZeaburReports,
  type CollectPortfolioZeaburOptions,
  type CollectPortfolioZeaburResult,
} from "./collect-deploy.js";

export { parseHubReportFromNoteBody } from "./parse-report.js";

export {
  buildPortfolioBrief,
  type BuildPortfolioBriefInput,
  type PortfolioBrief,
  type PortfolioReportNote,
  type Provenance,
  type ReportEdge,
  type ShaChainEntry,
  type StaleLineFinding,
  type WithProvenance,
} from "./brief.js";
