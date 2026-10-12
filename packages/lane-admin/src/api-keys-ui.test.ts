import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const adminJs = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../public/admin.js"),
  "utf8",
);

describe("admin API keys UI", () => {
  it("includes label, purpose, and unlabelled handling", () => {
    expect(adminJs).toContain("key-label");
    expect(adminJs).toContain("purpose");
    expect(adminJs).toContain("unlabelled");
    expect(adminJs).toContain("PATCH");
    expect(adminJs).toContain("rate_limit_per_minute");
  });
});
