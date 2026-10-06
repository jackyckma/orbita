import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sqlPath = join(
  import.meta.dirname,
  "..",
  "drizzle",
  "0001_tickets.sql",
);

describe("tickets DDL lint", () => {
  it("uses additive IF NOT EXISTS only (no DROP / ALTER existing tables)", () => {
    const sql = readFileSync(sqlPath, "utf8");
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS/i);
  });
});
