import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgTicketRepository } from "../../packages/lane-tickets/dist/pg-repository.js";
import { createLogger } from "../../packages/lane-platform/dist/index.js";

const runE2e =
  process.env.E2E_TIER_A === "1" &&
  (process.env.TICKETS_E2E_DATABASE_URL || process.env.DATABASE_URL);

const databaseUrl =
  process.env.TICKETS_E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

const CLIENT_A = "tickets-e2e-a";
const CLIENT_B = "tickets-e2e-b";

function charter() {
  return {
    purpose: "test",
    principles: ["p"],
    guardrails: {
      allowed_action_categories: ["L0"],
      forbidden_action_categories: [],
      max_auto_risk_tier: "L1",
    },
    cadence: { description: "daily" },
    reporting: { expectations: "none" },
    success_measures: ["ok"],
    review_date: "2026-12-31",
    assigned_principals: ["founder"],
    hard_limits: [],
    soft_constraints: [],
  };
}

describe.skipIf(!runE2e)("PgTicketRepository (real Postgres, tier A)", () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    const logger = createLogger("test");
    const { runMigrations } = await import(
      "../../apps/orbita-api/dist/migrate.js"
    );
    await runMigrations(databaseUrl, logger, { ticketsEnabled: true });
    sql = postgres(databaseUrl, { max: 10 });
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("create mandate→epic→task chain and list with filters + cursor", async () => {
    const repo = new PgTicketRepository(sql);
    const mandate = await repo.create({
      client_id: CLIENT_A,
      actor: { type: "human" },
      ticket: {
        project: "alpha",
        function: "dev",
        kind: "mandate",
        title: "M",
        charter: charter(),
      },
    });
    expect(mandate.ok).toBe(true);
    if (!mandate.ok) return;

    const mandateApproved = await repo.transition({
      client_id: CLIENT_A,
      ticket_id: mandate.value.ticket.id,
      verb: "ticket_approve",
      actor: { type: "human" },
    });
    expect(mandateApproved.ok).toBe(true);

    const epic = await repo.create({
      client_id: CLIENT_A,
      actor: { type: "human" },
      ticket: {
        project: "alpha",
        function: "dev",
        kind: "epic",
        parent_id: mandate.value.ticket.id,
        title: "E",
        acceptance_criteria: ["done"],
        risk_tier: "L0",
      },
    });
    expect(epic.ok).toBe(true);
    if (!epic.ok) return;

    await repo.transition({
      client_id: CLIENT_A,
      ticket_id: epic.value.ticket.id,
      verb: "ticket_progress",
      actor: { type: "agent", mandate_ids: [mandate.value.ticket.id] },
    });

    const task = await repo.create({
      client_id: CLIENT_A,
      actor: { type: "agent", mandate_ids: [mandate.value.ticket.id] },
      ticket: {
        project: "alpha",
        function: "dev",
        kind: "task",
        parent_id: epic.value.ticket.id,
        title: "T",
        risk_tier: "L0",
      },
    });
    expect(task.ok).toBe(true);
    if (!task.ok) return;

    const listed = await repo.list({
      client_id: CLIENT_A,
      project: "alpha",
      limit: 2,
    });
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.value.tickets.length).toBe(2);
      expect(listed.value.next_cursor).toBeTruthy();
    }
  });

  it("concurrent ticket_claim: exactly one winner, one LEASE_CONFLICT", async () => {
    const repo = new PgTicketRepository(sql);
    const mandate = await repo.create({
      client_id: CLIENT_A,
      actor: { type: "human" },
      ticket: {
        project: "claim",
        function: "dev",
        kind: "mandate",
        title: "M",
        charter: charter(),
      },
    });
    if (!mandate.ok) throw new Error("setup");
    await repo.transition({
      client_id: CLIENT_A,
      ticket_id: mandate.value.ticket.id,
      verb: "ticket_approve",
      actor: { type: "human" },
    });
    const epic = await repo.create({
      client_id: CLIENT_A,
      actor: { type: "human" },
      ticket: {
        project: "claim",
        function: "dev",
        kind: "epic",
        parent_id: mandate.value.ticket.id,
        title: "E",
        acceptance_criteria: ["x"],
        risk_tier: "L0",
      },
    });
    if (!epic.ok) throw new Error("epic");
    await repo.transition({
      client_id: CLIENT_A,
      ticket_id: epic.value.ticket.id,
      verb: "ticket_progress",
      actor: { type: "agent", mandate_ids: [mandate.value.ticket.id] },
    });
    const task = await repo.create({
      client_id: CLIENT_A,
      actor: { type: "agent", mandate_ids: [mandate.value.ticket.id] },
      ticket: {
        project: "claim",
        function: "dev",
        kind: "task",
        parent_id: epic.value.ticket.id,
        title: "T",
        risk_tier: "L0",
      },
    });
    if (!task.ok) throw new Error("task");
    const version = task.value.ticket.version;

    const [a, b] = await Promise.all([
      repo.transition({
        client_id: CLIENT_A,
        ticket_id: task.value.ticket.id,
        verb: "ticket_claim",
        actor: { type: "agent", mandate_ids: [mandate.value.ticket.id] },
        expected_version: version,
        lease_seconds: 60,
        lease_holder: "agent:a",
      }),
      repo.transition({
        client_id: CLIENT_A,
        ticket_id: task.value.ticket.id,
        verb: "ticket_claim",
        actor: { type: "agent", mandate_ids: [mandate.value.ticket.id] },
        expected_version: version,
        lease_seconds: 60,
        lease_holder: "agent:b",
      }),
    ]);

    const wins = [a, b].filter((r) => r.ok);
    const fails = [a, b].filter((r) => !r.ok);
    expect(wins.length).toBe(1);
    expect(fails.length).toBe(1);
    if (!fails[0]?.ok) {
      expect(["LEASE_CONFLICT", "VERSION_CONFLICT"]).toContain(
        fails[0].error.code,
      );
    }
  });

  it("tenant isolation: client B cannot read or claim client A ticket", async () => {
    const repo = new PgTicketRepository(sql);
    const created = await repo.create({
      client_id: CLIENT_A,
      actor: { type: "human" },
      ticket: {
        project: "iso",
        function: "dev",
        kind: "mandate",
        title: "M",
        charter: charter(),
      },
    });
    if (!created.ok) throw new Error("setup");
    const foreignGet = await repo.get({
      client_id: CLIENT_B,
      ticket_id: created.value.ticket.id,
    });
    expect(foreignGet.ok).toBe(false);
    const foreignClaim = await repo.transition({
      client_id: CLIENT_B,
      ticket_id: created.value.ticket.id,
      verb: "ticket_claim",
      actor: { type: "human" },
      lease_seconds: 30,
      lease_holder: "x",
    });
    expect(foreignClaim.ok).toBe(false);
  });

  it("idempotency_key replay returns the first result", async () => {
    const repo = new PgTicketRepository(sql);
    const mandate = await repo.create({
      client_id: CLIENT_A,
      actor: { type: "human" },
      ticket: {
        project: "idem",
        function: "dev",
        kind: "mandate",
        title: "M",
        charter: charter(),
      },
      idempotency_key: "create-once",
    });
    expect(mandate.ok).toBe(true);
    const replay = await repo.create({
      client_id: CLIENT_A,
      actor: { type: "human" },
      ticket: {
        project: "idem",
        function: "dev",
        kind: "mandate",
        title: "M2",
        charter: charter(),
      },
      idempotency_key: "create-once",
    });
    expect(replay.ok).toBe(true);
    if (mandate.ok && replay.ok) {
      expect(replay.value.replayed).toBe(true);
      expect(replay.value.ticket.id).toBe(mandate.value.ticket.id);
    }
  });
});
