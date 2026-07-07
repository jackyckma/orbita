import { describe, expect, it } from "vitest";
import { formatNoteContextLines } from "./notes-service.js";

describe("formatNoteContextLines", () => {
  it("formats note blocks with title and id", () => {
    const text = formatNoteContextLines([
      { id: "abc", title: "Rubric", body: "# Rules\nBe concrete." },
    ]);
    expect(text).toContain("### Rubric (abc)");
    expect(text).toContain("# Rules");
  });

  it("truncates long bodies", () => {
    const text = formatNoteContextLines([
      { id: "x", title: null, body: "a".repeat(1500) },
    ]);
    expect(text.length).toBeLessThan(1500);
    expect(text).toContain("…");
  });

  it("returns empty string for no notes", () => {
    expect(formatNoteContextLines([])).toBe("");
  });
});
