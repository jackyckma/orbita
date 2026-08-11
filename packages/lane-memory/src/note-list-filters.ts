/**
 * Pure helpers for GET /notes structured list filters (project, type, since, until).
 * Semantics match the hub list contract — keep in sync with listNotes().
 */

export type NoteListFilters = {
  project?: string;
  type?: string;
  /** Inclusive lower bound on updated_at */
  since?: Date;
  /** Exclusive upper bound on updated_at */
  until?: Date;
};

export type NoteListFilterable = {
  frontmatter: Record<string, unknown>;
  updated_at: string;
};

function frontmatterString(
  frontmatter: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = frontmatter[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseIsoDate(raw: string | undefined): Date | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return undefined;
  return new Date(ms);
}

/**
 * Parse known query params. Omitted / empty / invalid values mean no constraint.
 * Callers should ignore unknown query keys (not pass them here).
 */
export function parseNoteListFilters(query: {
  project?: string;
  type?: string;
  since?: string;
  until?: string;
}): NoteListFilters {
  const filters: NoteListFilters = {};

  const project = query.project?.trim();
  if (project) filters.project = project;

  const type = query.type?.trim();
  if (type) filters.type = type;

  const since = parseIsoDate(query.since);
  if (since) filters.since = since;

  const until = parseIsoDate(query.until);
  if (until) filters.until = until;

  return filters;
}

export function noteMatchesListFilters(
  note: NoteListFilterable,
  filters: NoteListFilters,
): boolean {
  if (filters.project) {
    const project = frontmatterString(note.frontmatter, "project");
    if (
      project == null ||
      project.toLowerCase() !== filters.project.toLowerCase()
    ) {
      return false;
    }
  }

  if (filters.type) {
    const type = frontmatterString(note.frontmatter, "type");
    if (type == null || type.toLowerCase() !== filters.type.toLowerCase()) {
      return false;
    }
  }

  const updatedMs = Date.parse(note.updated_at);
  if (Number.isNaN(updatedMs)) return false;

  if (filters.since && updatedMs < filters.since.getTime()) {
    return false;
  }

  if (filters.until && updatedMs >= filters.until.getTime()) {
    return false;
  }

  return true;
}
