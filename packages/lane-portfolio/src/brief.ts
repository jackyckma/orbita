import { extractTaskIds } from "./normalize.js";
import type {
  PortfolioProject,
  PortfolioRegistry,
  ReportPeriod,
} from "./types.js";

export type Provenance = "measured" | "derived" | "asserted";

export type WithProvenance<T> = {
  value: T;
  provenance: Provenance;
};

export type ReportEdge = "repo" | "deploy" | "runtime";

export type PortfolioReportNote = {
  id: string;
  updated_at: string;
  frontmatter: Record<string, unknown>;
  body: string;
  parsed_report: Record<string, unknown> | null;
};

export type StaleLineFinding = {
  edge: ReportEdge;
  status: "stale";
  last_report_at: string | null;
  silent_hours: WithProvenance<number>;
  expected_cadence_hours: WithProvenance<number>;
  message: WithProvenance<string>;
};

export type ShaChainEntry = {
  sha: WithProvenance<string>;
  task_ids: WithProvenance<string[]>;
  repo_report: {
    note_id: string;
    status: WithProvenance<string>;
    generated_at: WithProvenance<string | null>;
  } | null;
  deploy_report: {
    note_id: string;
    status: WithProvenance<string>;
    generated_at: WithProvenance<string | null>;
  } | null;
  flags: WithProvenance<string[]>;
};

export type LineSnapshot = {
  edge: ReportEdge;
  status: "present" | "stale" | "absent";
  latest: {
    note_id: string;
    updated_at: WithProvenance<string>;
    report_status: WithProvenance<string | null>;
    source_sha: WithProvenance<string | null>;
    generated_at: WithProvenance<string | null>;
  } | null;
  reports_in_period: Array<{
    note_id: string;
    updated_at: WithProvenance<string>;
    report: WithProvenance<Record<string, unknown> | null>;
    sections: WithProvenance<Record<string, string>>;
  }>;
};

export type ProjectBrief = {
  slug: WithProvenance<string>;
  display_name: WithProvenance<string>;
  enabled: WithProvenance<boolean>;
  lines: LineSnapshot[];
  staleness: StaleLineFinding[];
  sha_chains: ShaChainEntry[];
};

export type PortfolioBrief = {
  schema_version: "1.0";
  generated_at: WithProvenance<string>;
  period: WithProvenance<ReportPeriod>;
  projects: ProjectBrief[];
};

export type BuildPortfolioBriefInput = {
  registry: PortfolioRegistry;
  notes: PortfolioReportNote[];
  period: ReportPeriod;
  projectFilter?: string;
  referenceTime?: string;
  generatedAt?: string;
};

function fmString(
  frontmatter: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = frontmatter[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseEdge(frontmatter: Record<string, unknown>): ReportEdge | null {
  const edge = fmString(frontmatter, "edge");
  if (edge === "repo" || edge === "deploy" || edge === "runtime") return edge;
  return null;
}

function noteInPeriod(note: PortfolioReportNote, period: ReportPeriod): boolean {
  const updatedMs = Date.parse(note.updated_at);
  const sinceMs = Date.parse(period.since);
  const untilMs = Date.parse(period.until);
  if (Number.isNaN(updatedMs) || Number.isNaN(sinceMs) || Number.isNaN(untilMs)) {
    return false;
  }
  return updatedMs >= sinceMs && updatedMs < untilMs;
}

function expectedEdges(project: PortfolioProject): ReportEdge[] {
  const edges: ReportEdge[] = ["repo"];
  if (project.zeabur_project_name) edges.push("deploy");
  if (project.runtime_report_url) edges.push("runtime");
  return edges;
}

function reportStatus(
  parsed: Record<string, unknown> | null,
): string | null {
  if (!parsed) return null;
  const status = parsed.status;
  return typeof status === "string" ? status : null;
}

function reportGeneratedAt(
  parsed: Record<string, unknown> | null,
): string | null {
  if (!parsed) return null;
  const generatedAt = parsed.generated_at;
  return typeof generatedAt === "string" ? generatedAt : null;
}

function reportSourceSha(
  note: PortfolioReportNote,
  parsed: Record<string, unknown> | null,
): string | null {
  const fromFm = fmString(note.frontmatter, "source_sha");
  if (fromFm) return fromFm;
  if (!parsed) return null;
  const sha = parsed.source_sha;
  return typeof sha === "string" && sha.trim() ? sha.trim() : null;
}

function sectionBodies(
  parsed: Record<string, unknown> | null,
): Record<string, string> {
  if (!parsed || !Array.isArray(parsed.sections)) return {};
  const out: Record<string, string> = {};
  for (const section of parsed.sections) {
    if (
      section &&
      typeof section === "object" &&
      typeof (section as { id?: unknown }).id === "string" &&
      typeof (section as { body?: unknown }).body === "string"
    ) {
      out[(section as { id: string }).id] = (section as { body: string }).body;
    }
  }
  return out;
}

function shippedShas(sections: Record<string, string>): string[] {
  const shipped = sections.shipped ?? "";
  const shas: string[] = [];
  for (const line of shipped.split("\n")) {
    const match = line.match(/^- ([0-9a-f]{7,40})/i);
    if (match?.[1]) shas.push(match[1].toLowerCase());
  }
  return [...new Set(shas)];
}

function normalizeSha(sha: string): string {
  return sha.trim().toLowerCase();
}

function shaMatches(partialOrFull: string, candidate: string | null | undefined): boolean {
  if (!candidate) return false;
  const left = normalizeSha(partialOrFull);
  const right = normalizeSha(candidate);
  return right === left || right.startsWith(left) || left.startsWith(right);
}

function findDeployForSha(
  sha: string,
  deployBySha: Map<string, PortfolioReportNote>,
  deployNotes: PortfolioReportNote[],
): PortfolioReportNote | undefined {
  const direct = deployBySha.get(normalizeSha(sha));
  if (direct) return direct;
  return deployNotes.find((note) =>
    shaMatches(sha, reportSourceSha(note, note.parsed_report)),
  );
}

function isSuccessfulDeploy(status: string | null): boolean {
  if (!status) return false;
  const normalized = status.toLowerCase();
  return normalized === "ok" || normalized === "success" || normalized === "running";
}

function hoursBetween(fromIso: string, toIso: string): number {
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return 0;
  return Math.max(0, (toMs - fromMs) / 3_600_000);
}

function buildStaleness(
  project: PortfolioProject,
  edge: ReportEdge,
  latest: PortfolioReportNote | undefined,
  referenceTime: string,
): StaleLineFinding | null {
  const cadence = project.expected_cadence_hours;
  if (!latest) {
    return {
      edge,
      status: "stale",
      last_report_at: null,
      silent_hours: { value: Infinity, provenance: "derived" },
      expected_cadence_hours: { value: cadence, provenance: "measured" },
      message: {
        value: `${edge} line: no report ever collected for ${project.slug}`,
        provenance: "derived",
      },
    };
  }

  const silentHours = hoursBetween(latest.updated_at, referenceTime);
  if (silentHours <= cadence) return null;

  return {
    edge,
    status: "stale",
    last_report_at: latest.updated_at,
    silent_hours: { value: silentHours, provenance: "derived" },
    expected_cadence_hours: { value: cadence, provenance: "measured" },
    message: {
      value: `${edge} line silent for ${Math.round(silentHours)}h (expected every ${cadence}h) — last report ${latest.updated_at}`,
      provenance: "derived",
    },
  };
}

function buildShaChains(
  projectSlug: string,
  repoNotes: PortfolioReportNote[],
  deployNotes: PortfolioReportNote[],
): ShaChainEntry[] {
  const deployBySha = new Map<string, PortfolioReportNote>();
  for (const note of deployNotes) {
    const sha = reportSourceSha(note, note.parsed_report);
    if (sha) deployBySha.set(normalizeSha(sha), note);
  }

  const chains = new Map<string, ShaChainEntry>();

  for (const note of repoNotes) {
    const parsed = note.parsed_report;
    const sections = sectionBodies(parsed);
    const shipped = sections.shipped ?? "";
    const taskIds = extractTaskIds(shipped);
    const shas = shippedShas(sections);
    const headSha = reportSourceSha(note, parsed);
    if (headSha && !shas.some((sha) => shaMatches(sha, headSha))) {
      shas.push(normalizeSha(headSha));
    }

    for (const sha of shas) {
      const deploy = findDeployForSha(sha, deployBySha, deployNotes);
      const flags: string[] = [];
      const repoStatus = reportStatus(parsed);
      if (repoStatus === "ok" || shipped.includes(sha)) {
        const deployStatus = deploy ? reportStatus(deploy.parsed_report) : null;
        if (!deploy) {
          flags.push("merged_without_deploy_report");
        } else if (!isSuccessfulDeploy(deployStatus)) {
          flags.push("merged_without_successful_deploy");
        }
      }

      const canonicalSha = deploy
        ? normalizeSha(reportSourceSha(deploy, deploy.parsed_report) ?? sha)
        : normalizeSha(headSha ?? sha);
      const existing = chains.get(canonicalSha);
      const mergedTaskIds = [
        ...new Set([...(existing?.task_ids.value ?? []), ...taskIds]),
      ];

      chains.set(canonicalSha, {
        sha: { value: canonicalSha, provenance: "measured" },
        task_ids: { value: mergedTaskIds, provenance: "derived" },
        repo_report: {
          note_id: note.id,
          status: {
            value: repoStatus ?? "unknown",
            provenance: parsed ? "measured" : "derived",
          },
          generated_at: {
            value: reportGeneratedAt(parsed),
            provenance: parsed ? "measured" : "derived",
          },
        },
        deploy_report: deploy
          ? {
              note_id: deploy.id,
              status: {
                value: reportStatus(deploy.parsed_report) ?? "unknown",
                provenance: "measured",
              },
              generated_at: {
                value: reportGeneratedAt(deploy.parsed_report),
                provenance: "measured",
              },
            }
          : existing?.deploy_report ?? null,
        flags: {
          value: [...new Set([...(existing?.flags.value ?? []), ...flags])],
          provenance: "derived",
        },
      });
    }
  }

  void projectSlug;
  return [...chains.values()];
}

function buildLineSnapshot(
  edge: ReportEdge,
  allNotes: PortfolioReportNote[],
  periodNotes: PortfolioReportNote[],
  stale: StaleLineFinding | null,
): LineSnapshot {
  const edgeNotes = allNotes.filter(
    (n) => parseEdge(n.frontmatter) === edge,
  );
  const latest = edgeNotes[0];
  const periodEdgeNotes = periodNotes.filter(
    (n) => parseEdge(n.frontmatter) === edge,
  );

  return {
    edge,
    status: stale ? "stale" : latest ? "present" : "absent",
    latest: latest
      ? {
          note_id: latest.id,
          updated_at: { value: latest.updated_at, provenance: "measured" },
          report_status: {
            value: reportStatus(latest.parsed_report),
            provenance: latest.parsed_report ? "measured" : "derived",
          },
          source_sha: {
            value: reportSourceSha(latest, latest.parsed_report),
            provenance: "measured",
          },
          generated_at: {
            value: reportGeneratedAt(latest.parsed_report),
            provenance: latest.parsed_report ? "measured" : "derived",
          },
        }
      : null,
    reports_in_period: periodEdgeNotes.map((note) => {
      const sections = sectionBodies(note.parsed_report);
      const assertedSections: Record<string, string> = {};
      for (const [id, body] of Object.entries(sections)) {
        assertedSections[id] = body;
      }
      return {
        note_id: note.id,
        updated_at: { value: note.updated_at, provenance: "measured" },
        report: {
          value: note.parsed_report,
          provenance: note.parsed_report ? "measured" : "derived",
        },
        sections: {
          value: assertedSections,
          provenance: "asserted",
        },
      };
    }),
  };
}

/**
 * Build a structured portfolio brief from registry + collected report notes.
 * Pure function — no I/O.
 */
export function buildPortfolioBrief(
  input: BuildPortfolioBriefInput,
): PortfolioBrief {
  const referenceTime = input.referenceTime ?? input.period.until;
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  const projects = input.registry.projects.filter((project) => {
    if (!project.enabled) return false;
    if (input.projectFilter) {
      return project.slug.toLowerCase() === input.projectFilter.toLowerCase();
    }
    return true;
  });

  const notesByProject = new Map<string, PortfolioReportNote[]>();
  for (const note of input.notes) {
    const project = fmString(note.frontmatter, "project");
    if (!project) continue;
    const list = notesByProject.get(project) ?? [];
    list.push(note);
    notesByProject.set(project, list);
  }

  for (const [, list] of notesByProject) {
    list.sort(
      (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at),
    );
  }

  const periodNotes = input.notes.filter((note) => noteInPeriod(note, input.period));

  const projectBriefs: ProjectBrief[] = projects.map((project) => {
    const allNotes = notesByProject.get(project.slug) ?? [];
    const projectPeriodNotes = periodNotes.filter(
      (n) => fmString(n.frontmatter, "project") === project.slug,
    );

    const edges = expectedEdges(project);
    const staleness: StaleLineFinding[] = [];
    const lines: LineSnapshot[] = [];

    for (const edge of edges) {
      const edgeAll = allNotes.filter((n) => parseEdge(n.frontmatter) === edge);
      const latest = edgeAll[0];
      const stale = buildStaleness(project, edge, latest, referenceTime);
      if (stale) staleness.push(stale);
      lines.push(
        buildLineSnapshot(
          edge,
          allNotes,
          projectPeriodNotes,
          stale,
        ),
      );
    }

    const repoNotes = projectPeriodNotes.filter(
      (n) => parseEdge(n.frontmatter) === "repo",
    );
    const deployNotes = allNotes.filter(
      (n) => parseEdge(n.frontmatter) === "deploy",
    );

    return {
      slug: { value: project.slug, provenance: "measured" },
      display_name: { value: project.display_name, provenance: "measured" },
      enabled: { value: project.enabled, provenance: "measured" },
      lines,
      staleness,
      sha_chains: buildShaChains(project.slug, repoNotes, deployNotes),
    };
  });

  return {
    schema_version: "1.0",
    generated_at: { value: generatedAt, provenance: "derived" },
    period: { value: input.period, provenance: "measured" },
    projects: projectBriefs,
  };
}
