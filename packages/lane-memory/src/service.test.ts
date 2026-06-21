import { describe, expect, it } from "vitest";
import { formatMemoryLines } from "./service.js";

describe("formatMemoryLines", () => {
  it("formats bullet list", () => {
    const text = formatMemoryLines([
      { key: "project", content: "Orbita agent system" },
      { key: "stack", content: "TypeScript + Hono" },
    ]);
    expect(text).toContain("- [project] Orbita agent system");
    expect(text).toContain("- [stack] TypeScript + Hono");
  });

  it("returns empty string for no rows", () => {
    expect(formatMemoryLines([])).toBe("");
  });
});
