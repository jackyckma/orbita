import { describe, expect, it } from "vitest";
import { secureCompareToken } from "./secure-token.js";

describe("secureCompareToken", () => {
  it("matches equal tokens", () => {
    expect(secureCompareToken("secret-token", "secret-token")).toBe(true);
  });

  it("rejects missing or wrong tokens", () => {
    expect(secureCompareToken(undefined, "secret-token")).toBe(false);
    expect(secureCompareToken("wrong", "secret-token")).toBe(false);
  });
});
