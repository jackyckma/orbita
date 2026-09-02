import { describe, expect, it } from "vitest";
import {
  embeddingMetaFromEmbed,
  formatNoteContextLines,
} from "./notes-service.js";

describe("embeddingMetaFromEmbed", () => {
  it("returns indexed:true when embedding succeeded", () => {
    expect(
      embeddingMetaFromEmbed([0.1, 0.2], null),
    ).toEqual({ indexed: true });
  });

  it("surfaces structured failure reason when embedding is null", () => {
    expect(
      embeddingMetaFromEmbed(null, { reason: "missing_key" }),
    ).toEqual({ indexed: false, failure: { reason: "missing_key" } });
  });

  it("returns indexed:false without failure when reason is unknown", () => {
    expect(embeddingMetaFromEmbed(null, null)).toEqual({ indexed: false });
  });
});

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
