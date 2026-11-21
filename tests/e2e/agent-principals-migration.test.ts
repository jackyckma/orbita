import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { createLogger } from "../../packages/lane-platform/dist/index.js";

const runE2e = process.env.E2E_TIER_A === "1" && process.env.DATABASE_URL;
const databaseUrl = process.env.DATABASE_URL ?? "";

describe.skipIf(!runE2e).sequential("agent principals migrations (tier A)", () => {
  const sql = postgres(databaseUrl, { max: 1 });
  const logger = createLogger("test");

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("flag OFF default tier-A path does not create agent_principals tables", async () => {
    const rows = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('agent_principals', 'agent_audit')
      ORDER BY table_name
    `;
    expect(rows.map((r) => r.table_name)).toEqual([]);
  });

  it("applies optional-agent-principals.sql twice idempotently when flag is on", async () => {
    const { runMigrations } = await import(
      "../../apps/orbita-api/dist/migrate.js"
    );
    await runMigrations(databaseUrl, logger, { agentPrincipalsEnabled: true });
    await runMigrations(databaseUrl, logger, { agentPrincipalsEnabled: true });
    const rows = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('agent_principals', 'agent_audit')
      ORDER BY table_name
    `;
    expect(rows.map((r) => r.table_name)).toEqual([
      "agent_audit",
      "agent_principals",
    ]);
  });
});
