import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { verifyPkceS256 } from "./pkce.js";

describe("pkce", () => {
  it("validates S256 verifier", () => {
    const verifier = "test-verifier-123";
    const challenge = createHash("sha256")
      .update(verifier)
      .digest("base64url");
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
    expect(verifyPkceS256("wrong", challenge)).toBe(false);
  });
});
