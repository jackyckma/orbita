import { describe, expect, it } from "vitest";
import { hashApiKey, isClientIdAllowed } from "./api-keys.js";
import type { ApiKeyRow } from "../db/schema.js";

describe("api-keys", () => {
  it("hashes keys deterministically", () => {
    expect(hashApiKey("orb_test")).toHaveLength(64);
    expect(hashApiKey("orb_test")).toBe(hashApiKey("orb_test"));
  });

  it("checks client_id allow-list", () => {
    const row = {
      allowedClientIds: ["project-a", "project-b"],
    } as ApiKeyRow;

    expect(isClientIdAllowed(row, "project-a")).toBe(true);
    expect(isClientIdAllowed(row, "project-c")).toBe(false);
  });
});
