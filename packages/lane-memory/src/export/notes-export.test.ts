import { describe, expect, it } from "vitest";
import { formatNoteExportBody, noteExportPath } from "../notes-service.js";

describe("noteExportPath", () => {
  it("uses trimmed title as filename", () => {
    expect(noteExportPath({ id: "n1", title: "  Meeting Notes  " })).toBe(
      "Meeting Notes.md",
    );
  });

  it("falls back to id when title is null or blank", () => {
    expect(noteExportPath({ id: "abc-123", title: null })).toBe("abc-123.md");
    expect(noteExportPath({ id: "abc-123", title: "   " })).toBe("abc-123.md");
  });

  it("sanitizes filesystem-unsafe characters", () => {
    expect(noteExportPath({ id: "n1", title: 'a/b:c*d?"e' })).toBe("a-b-c-d--e.md");
  });
});

describe("formatNoteExportBody", () => {
  it("formats title heading and body without links", () => {
    const body = formatNoteExportBody(
      { id: "n1", title: "Rubric", body: "Be concrete." },
      [],
    );
    expect(body).toBe("# Rubric\n\nBe concrete.\n");
  });

  it("uses id as heading when title is missing", () => {
    const body = formatNoteExportBody(
      { id: "note-42", title: null, body: "orphan body" },
      [],
    );
    expect(body.startsWith("# note-42\n")).toBe(true);
    expect(body).toContain("orphan body");
  });

  it("appends outgoing wikilinks from note_links targets", () => {
    const body = formatNoteExportBody(
      { id: "from", title: "Source", body: "See related." },
      [
        { id: "to-1", title: "Target Alpha" },
        { id: "to-2", title: null },
        { id: "to-3", title: "  " },
      ],
    );
    expect(body).toContain("# Source");
    expect(body).toContain("See related.");
    expect(body).toContain("## Links");
    expect(body).toContain("- [[Target Alpha]]");
    expect(body).toContain("- [[to-2]]");
    expect(body).toContain("- [[to-3]]");
    expect(body).toMatch(/\[\[Target Alpha\]\]/);
  });
});
