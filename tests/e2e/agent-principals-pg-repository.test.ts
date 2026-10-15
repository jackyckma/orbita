import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgAgentPrincipalRepository } from "../../packages/lane-agent-principals/dist/pg-repository.js";
import { createLogger } from "../../packages/lane-platform/dist/index.js";

const runE2e =
  process.env.E2E_TIER_A === "1" &&
  (process.env.AGENT_PRINCIPALS_E2E_DATABASE_URL || process.env.DATABASE_URL);

const databaseUrl =
  process.env.AGENT_PRINCIPALS_E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "";

const CLIENT_A = "agent-principals-e2e-a";
const CLIENT_B = "agent-principals-e2e-b";

describe.skipIf(!runE2e)("PgAgentPrincipalRepository (real Postgres, tier A)", () => {
  let sql: postgres.Sql | undefined;

  beforeAll(async () => {
    const logger = createLogger("test");
    const { runMigrations } = await import(
      "../../apps/orbita-api/dist/migrate.js"
    );
    await runMigrations(databaseUrl, logger, { agentPrincipalsEnabled: true });
    sql = postgres(databaseUrl, { max: 10 });
  });

  afterAll(async () => {
    if (sql) {
      await sql.end({ timeout: 5 });
    }
  });

  it("tenant isolation on getPrincipal", async () => {
    const repo = new PgAgentPrincipalRepository(sql);
    const created = await repo.createPrincipal({
      client_id: CLIENT_A,
      kind: "human",
      name: "a",
      bound_api_key_id: `key-${CLIENT_A}`,
      scopes: ["sessions:use"],
      mandate_ids: [],
    });
    const foreign = await repo.getPrincipal(CLIENT_B, created.id);
    expect(foreign).toBeNull();
  });

  it("appendAudit rows are listed only for matching client_id", async () => {
    const repo = new PgAgentPrincipalRepository(sql);
    const p = await repo.createPrincipal({
      client_id: CLIENT_A,
      kind: "external-agent",
      name: "bot",
      bound_api_key_id: `key-bot-${Date.now()}`,
      scopes: ["tickets:read"],
      mandate_ids: [],
    });
    await repo.appendAudit({
      client_id: CLIENT_A,
      principal_id: p.id,
      surface: "rest",
      operation: "GET /v1/tickets",
      decision: "allow",
      reason_code: "SCOPE_OK",
    });
    const events = await repo.listAudit({ client_id: CLIENT_B, principal_id: p.id });
    expect(events).toHaveLength(0);
    const own = await repo.listAudit({ client_id: CLIENT_A, principal_id: p.id });
    expect(own.length).toBeGreaterThanOrEqual(1);
  });
});
