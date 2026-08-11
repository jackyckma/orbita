import { describe, expect, it } from "vitest";
import {
  noteMatchesListFilters,
  parseNoteListFilters,
  type NoteListFilterable,
} from "./note-list-filters.js";

function note(
  partial: Partial<NoteListFilterable> & { updated_at: string },
): NoteListFilterable {
  return {
    frontmatter: partial.frontmatter ?? {},
    updated_at: partial.updated_at,
  };
}

describe("parseNoteListFilters", () => {
  it("returns empty object when all params omitted", () => {
    expect(parseNoteListFilters({})).toEqual({});
  });

  it("trims project and type; ignores blank", () => {
    expect(
      parseNoteListFilters({ project: "  orbita  ", type: "   " }),
    ).toEqual({ project: "orbita" });
  });

  it("parses valid ISO since/until; ignores invalid", () => {
    const filters = parseNoteListFilters({
      since: "2026-01-01T00:00:00.000Z",
      until: "not-a-date",
    });
    expect(filters.since?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(filters.until).toBeUndefined();
  });
});

describe("noteMatchesListFilters", () => {
  const base = note({
    frontmatter: { project: "Orbita", type: "Report" },
    updated_at: "2026-06-15T12:00:00.000Z",
  });

  it("filters by project case-insensitively", () => {
    expect(
      noteMatchesListFilters(base, { project: "orbita" }),
    ).toBe(true);
    expect(
      noteMatchesListFilters(base, { project: "other" }),
    ).toBe(false);
  });

  it("filters by type case-insensitively", () => {
    expect(noteMatchesListFilters(base, { type: "report" })).toBe(true);
    expect(noteMatchesListFilters(base, { type: "decision" })).toBe(false);
  });

  it("applies since inclusive and until exclusive on updated_at", () => {
    const since = new Date("2026-06-15T12:00:00.000Z");
    const until = new Date("2026-06-15T12:00:00.000Z");
    expect(noteMatchesListFilters(base, { since })).toBe(true);
    expect(noteMatchesListFilters(base, { until })).toBe(false);

    const laterUntil = new Date("2026-06-15T12:00:00.001Z");
    expect(noteMatchesListFilters(base, { until: laterUntil })).toBe(true);

    const after = note({
      frontmatter: base.frontmatter,
      updated_at: "2026-06-16T00:00:00.000Z",
    });
    expect(
      noteMatchesListFilters(after, {
        since: new Date("2026-06-15T12:00:00.000Z"),
        until: new Date("2026-06-16T00:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("combines project, type, and time window", () => {
    const filters = {
      project: "ORBITA",
      type: "report",
      since: new Date("2026-06-01T00:00:00.000Z"),
      until: new Date("2026-07-01T00:00:00.000Z"),
    };
    expect(noteMatchesListFilters(base, filters)).toBe(true);
    expect(
      noteMatchesListFilters(
        note({
          frontmatter: { project: "orbita", type: "instruction" },
          updated_at: base.updated_at,
        }),
        filters,
      ),
    ).toBe(false);
  });

  it("rejects missing frontmatter fields when filtered", () => {
    expect(
      noteMatchesListFilters(
        note({ frontmatter: {}, updated_at: base.updated_at }),
        { project: "orbita" },
      ),
    ).toBe(false);
  });
});
