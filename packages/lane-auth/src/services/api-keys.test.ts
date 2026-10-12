import { describe, expect, it } from "vitest";
import {
  apiKeyAuditFields,
  deriveApiKeyState,
  hashApiKey,
  isApiKeyUnlabelled,
  isClientIdAllowed,
} from "./api-keys.js";
import type { ApiKeyRow } from "../db/schema.js";

describe("api-keys", () => {
  it("hashes consistently", () => {
    const h = hashApiKey("orb_test");
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(hashApiKey("orb_test")).toBe(h);
  });

  it("checks client_id allow list", () => {
    const row = {
      allowedClientIds: ["a", "b"],
    } as ApiKeyRow;
    expect(isClientIdAllowed(row, "a")).toBe(true);
    expect(isClientIdAllowed(row, "c")).toBe(false);
  });

  it("marks empty labels as unlabelled", () => {
    expect(isApiKeyUnlabelled(null)).toBe(true);
    expect(isApiKeyUnlabelled("  ")).toBe(true);
    expect(isApiKeyUnlabelled("cursor")).toBe(false);
  });

  it("derives lifecycle state", () => {
    const base = {
      revokedAt: null,
      expiresAt: null,
    } as ApiKeyRow;
    expect(deriveApiKeyState(base)).toBe("active");
    expect(
      deriveApiKeyState({
        ...base,
        revokedAt: new Date("2026-01-01"),
      } as ApiKeyRow),
    ).toBe("revoked");
    expect(
      deriveApiKeyState(
        {
          ...base,
          expiresAt: new Date("2020-01-01"),
        } as ApiKeyRow,
        new Date("2026-01-01"),
      ),
    ).toBe("expired");
  });

  it("includes key_label in audit fields when row is known", () => {
    expect(
      apiKeyAuditFields({ keyPrefix: "orb_abc", label: "my-key" }),
    ).toEqual({ key_prefix: "orb_abc", key_label: "my-key" });
    expect(apiKeyAuditFields(null, "orb_token123456")).toEqual({
      key_prefix: "orb_token123",
      key_label: null,
    });
  });
});
