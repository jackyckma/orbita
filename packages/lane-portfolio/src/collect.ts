import { createHash } from "node:crypto";
import {
  fetchProjectAutopilotFromGithub,
  type GithubFetcherDeps,
} from "./github.js";
import { normalizeRepoReport, reportToNoteBody } from "./normalize.js";
import {
  enabledPortfolioProjects,
  loadPortfolioRegistry,
} from "./registry.js";
import type {
  HubRepoReport,
  PortfolioProject,
  ReportPeriod,
} from "./types.js";

export type NoteWriter = (input: {
  id?: string;
  title?: string | null;
  body: string;
  frontmatter?: Record<string, unknown>;
}) => Promise<{ id: string }>;

export type PreviousAskLookup = (
  projectSlug: string,
) => Promise<string | null>;

export type CollectPortfolioGitOptions = {
  clientId?: string;
  period: ReportPeriod;
  token: string;
  putNote: NoteWriter;
  previousAskForProject?: PreviousAskLookup;
  projects?: PortfolioProject[];
  fetchImpl?: typeof fetch;
  generatedAt?: string;
};

export type CollectPortfolioGitResult = {
  reports: HubRepoReport[];
  noteIds: string[];
  failures: Array<{ project: string; error: string }>;
};

function stableNoteId(project: string, period: ReportPeriod, edge: string): string {
  const dig = createHash("sha256")
    .update(`portfolio-report:${edge}:${project}:${period.since}:${period.until}`)
    .digest("hex")
    .slice(0, 32);
  // UUID-shaped stable id
  return `${dig.slice(0, 8)}-${dig.slice(8, 12)}-${dig.slice(12, 16)}-${dig.slice(16, 20)}-${dig.slice(20, 32)}`;
}

/**
 * Collect repo-edge reports for every enabled portfolio project and store notes.
 * Credential must already be resolved (never log the token).
 */
export async function collectPortfolioGitReports(
  options: CollectPortfolioGitOptions,
): Promise<CollectPortfolioGitResult> {
  const projects =
    options.projects ?? enabledPortfolioProjects(loadPortfolioRegistry());
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const deps: GithubFetcherDeps = {
    token: options.token,
    fetchImpl: options.fetchImpl,
  };

  const reports: HubRepoReport[] = [];
  const noteIds: string[] = [];
  const failures: Array<{ project: string; error: string }> = [];

  for (const project of projects) {
    const previousAsk = options.previousAskForProject
      ? await options.previousAskForProject(project.slug)
      : null;

    const fetched = await fetchProjectAutopilotFromGithub(
      project,
      options.period,
      deps,
    );

    const report = fetched.ok
      ? normalizeRepoReport({
          project: project.slug,
          period: options.period,
          generatedAt,
          sourceSha: fetched.sourceSha,
          files: fetched.files,
          commits: fetched.commits,
          previousAsk,
        })
      : normalizeRepoReport({
          project: project.slug,
          period: options.period,
          generatedAt,
          sourceSha: fetched.sourceSha,
          files: {
            backlog: null,
            roadmap: null,
            locks: null,
            pauseState: null,
            decisions: null,
            latestReport: null,
            missingOptional: [],
          },
          commits: [],
          previousAsk,
          fetchError: fetched.error,
        });

    reports.push(report);
    if (report.status === "failed" && report.error) {
      failures.push({ project: project.slug, error: report.error });
    }

    const noteId = stableNoteId(project.slug, options.period, "repo");
    const note = await options.putNote({
      id: noteId,
      title: `repo report — ${project.slug} — ${options.period.until.slice(0, 10)}`,
      body: reportToNoteBody(report),
      frontmatter: {
        type: "report",
        project: project.slug,
        edge: "repo",
        period: options.period,
        period_since: options.period.since,
        period_until: options.period.until,
        source_sha: report.source_sha,
        schema_version: "1.1",
        status: report.status,
        source: "orbita-pull",
      },
    });
    noteIds.push(note.id);
  }

  return { reports, noteIds, failures };
}

/** Default period: last 24h ending now (UTC). */
export function defaultCollectPeriod(now = new Date()): ReportPeriod {
  const until = now.toISOString();
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  return { since, until };
}
