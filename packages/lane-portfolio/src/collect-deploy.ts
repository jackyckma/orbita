import { createHash } from "node:crypto";
import {
  deployReportToNoteBody,
  normalizeDeployReport,
} from "./normalize-deploy.js";
import {
  loadPortfolioRegistry,
  zeaburPortfolioProjects,
} from "./registry.js";
import type {
  HubDeployReport,
  PortfolioProject,
  ReportPeriod,
} from "./types.js";
import {
  fetchZeaburDeploymentsForProject,
  type ZeaburGraphqlDeps,
} from "./zeabur.js";

export type NoteWriter = (input: {
  id?: string;
  title?: string | null;
  body: string;
  frontmatter?: Record<string, unknown>;
}) => Promise<{ id: string }>;

export type PreviousAskLookup = (projectSlug: string) => Promise<string | null>;

export type CollectPortfolioZeaburOptions = {
  clientId?: string;
  period: ReportPeriod;
  token: string;
  putNote: NoteWriter;
  previousAskForProject?: PreviousAskLookup;
  projects?: PortfolioProject[];
  fetchImpl?: typeof fetch;
  generatedAt?: string;
};

export type CollectPortfolioZeaburResult = {
  reports: HubDeployReport[];
  noteIds: string[];
  failures: Array<{ project: string; error: string }>;
  skipped: Array<{ project: string; reason: string }>;
};

function stableNoteId(project: string, period: ReportPeriod, edge: string): string {
  const dig = createHash("sha256")
    .update(`portfolio-report:${edge}:${project}:${period.since}:${period.until}`)
    .digest("hex")
    .slice(0, 32);
  return `${dig.slice(0, 8)}-${dig.slice(8, 12)}-${dig.slice(12, 16)}-${dig.slice(16, 20)}-${dig.slice(20, 32)}`;
}

/**
 * Collect deploy-edge reports for enabled registry projects that have zeabur_project_name.
 * Credential must already be resolved (never log the token).
 */
export async function collectPortfolioZeaburReports(
  options: CollectPortfolioZeaburOptions,
): Promise<CollectPortfolioZeaburResult> {
  const projects =
    options.projects ?? zeaburPortfolioProjects(loadPortfolioRegistry());
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const deps: ZeaburGraphqlDeps = {
    token: options.token,
    fetchImpl: options.fetchImpl,
  };

  const reports: HubDeployReport[] = [];
  const noteIds: string[] = [];
  const failures: Array<{ project: string; error: string }> = [];
  const skipped: Array<{ project: string; reason: string }> = [];

  for (const project of projects) {
    const name = project.zeabur_project_name?.trim();
    if (!name) {
      skipped.push({
        project: project.slug,
        reason: "zeabur_project_name is null",
      });
      continue;
    }

    const previousAsk = options.previousAskForProject
      ? await options.previousAskForProject(project.slug)
      : null;

    const fetched = await fetchZeaburDeploymentsForProject(name, options.period, deps);

    const report = fetched.ok
      ? normalizeDeployReport({
          project: project.slug,
          period: options.period,
          generatedAt,
          deployments: fetched.deployments,
          failedBuildLogs: fetched.failedBuildLogs,
          previousAsk,
          zeaburProjectId: fetched.zeaburProjectId,
          zeaburProjectName: fetched.zeaburProjectName,
        })
      : normalizeDeployReport({
          project: project.slug,
          period: options.period,
          generatedAt,
          deployments: fetched.deployments,
          failedBuildLogs: fetched.failedBuildLogs,
          previousAsk,
          fetchError: fetched.error,
        });

    reports.push(report);
    if (report.status === "failed" && report.error) {
      failures.push({ project: project.slug, error: report.error });
    }

    const noteId = stableNoteId(project.slug, options.period, "deploy");
    const note = await options.putNote({
      id: noteId,
      title: `deploy report — ${project.slug} — ${options.period.until.slice(0, 10)}`,
      body: deployReportToNoteBody(report),
      frontmatter: {
        type: "report",
        project: project.slug,
        edge: "deploy",
        period: options.period,
        period_since: options.period.since,
        period_until: options.period.until,
        source_sha: report.source_sha,
        sha_confidence: report.sha_confidence,
        schema_version: "1.1",
        status: report.status,
        source: "orbita-pull",
      },
    });
    noteIds.push(note.id);
  }

  return { reports, noteIds, failures, skipped };
}

/** Default period: last 24h ending now (UTC). */
export function defaultCollectPeriod(now = new Date()): ReportPeriod {
  const until = now.toISOString();
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  return { since, until };
}
