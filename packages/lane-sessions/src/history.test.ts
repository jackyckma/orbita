import { describe, expect, it } from "vitest";
import { estimateTokens } from "./services/history.js";

describe("history", () => {
  it("estimates tokens", () => {
    expect(estimateTokens("hello world")).toBeGreaterThan(0);
  });
});
