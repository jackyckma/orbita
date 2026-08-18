import type { MemoryDb } from "@orbita/memory";
import { getNoteById, listNotes } from "@orbita/memory";
import {
  buildPortfolioBrief,
  loadPortfolioRegistry,
  parseHubReportFromNoteBody,
  type PortfolioReportNote,
} from "@orbita/portfolio";

export type PortfolioBriefDeps = {
  clientId: string;
  memoryDb: MemoryDb;
};

function toReportNote(
  id: string,
  updated_at: string,
  frontmatter: Record<string, unknown>,
  body: string,
): PortfolioReportNote {
  return {
    id,
    updated_at,
    frontmatter,
    body,
    parsed_report: parseHubReportFromNoteBody(body),
  };
}

/** Load type=report notes for portfolio_brief (client-scoped). */
export async function fetchPortfolioReportNotes(
  deps: PortfolioBriefDeps,
  filters: {
    project?: string;
  },
): Promise<PortfolioReportNote[]> {
  const items = await listNotes(deps.memoryDb, deps.clientId, 500, {
    type: "report",
    project: filters.project,
  });

  const records = await Promise.all(
    items.map((item) => getNoteById(deps.memoryDb, deps.clientId, item.id)),
  );

  return records
    .filter((note): note is NonNullable<typeof note> => note != null)
    .map((note) =>
      toReportNote(
        note.id,
        note.updated_at,
        note.frontmatter,
        note.body,
      ),
    );
}

export async function portfolioBrief(
  deps: PortfolioBriefDeps,
  input: {
    since: string;
    until?: string;
    project?: string;
  },
) {
  const until = input.until ?? new Date().toISOString();
  const sinceMs = Date.parse(input.since);
  const untilMs = Date.parse(until);
  if (Number.isNaN(sinceMs) || Number.isNaN(untilMs)) {
    throw new Error("since and until must be valid ISO-8601 timestamps");
  }
  if (sinceMs >= untilMs) {
    throw new Error("since must be before until");
  }

  const period = { since: input.since, until };
  const notes = await fetchPortfolioReportNotes(deps, {
    project: input.project,
  });

  return buildPortfolioBrief({
    registry: loadPortfolioRegistry(),
    notes,
    period,
    projectFilter: input.project,
    referenceTime: until,
  });
}
