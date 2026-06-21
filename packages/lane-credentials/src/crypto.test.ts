import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto.js";

describe("crypto", () => {
  it("round-trips secrets", () => {
    const key = "test-secrets-key-for-unit-tests";
    const cipher = encryptSecret("my-secret-token", key);
    expect(decryptSecret(cipher, key)).toBe("my-secret-token");
  });
});
