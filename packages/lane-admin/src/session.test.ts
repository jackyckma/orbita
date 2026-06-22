import { describe, expect, it } from "vitest";
import {
  createAdminSessionToken,
  verifyAdminSessionToken,
} from "./session.js";

describe("admin session", () => {
  const key = "test-secrets-key-32chars-min";

  it("creates and verifies session token", () => {
    const token = createAdminSessionToken(key, 1_000_000);
    expect(verifyAdminSessionToken(token, key, 1_000_000)).toBe(true);
  });

  it("rejects expired token", () => {
    const token = createAdminSessionToken(key, 1_000_000);
    expect(verifyAdminSessionToken(token, key, 1_000_000 + 13 * 60 * 60 * 1000)).toBe(
      false,
    );
  });

  it("rejects tampered token", () => {
    const token = createAdminSessionToken(key);
    expect(verifyAdminSessionToken(`${token}x`, key)).toBe(false);
  });
});
