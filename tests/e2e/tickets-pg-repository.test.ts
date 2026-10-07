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
      allowed_action_categories: ["dev", "L0"],
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
      actor: { role: "founder" },
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
      actor: { role: "founder" },
    });
    expect(mandateApproved.ok).toBe(true);

    const epic = await repo.create({
      client_id: CLIENT_A,
      actor: { role: "founder" },
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
      verb: "ticket_approve",
      actor: { role: "founder" },
    });

    const task = await repo.create({
      client_id: CLIENT_A,
      actor: { role: "executor", mandate_ids: [mandate.value.ticket.id] },
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
      actor: { role: "founder" },
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
      actor: { role: "founder" },
    });
    const epic = await repo.create({
      client_id: CLIENT_A,
      actor: { role: "founder" },
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
      verb: "ticket_approve",
      actor: { role: "founder" },
    });
    const task = await repo.create({
      client_id: CLIENT_A,
      actor: { role: "executor", mandate_ids: [mandate.value.ticket.id] },
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
        actor: { role: "executor", mandate_ids: [mandate.value.ticket.id] },
        expected_version: version,
        lease_seconds: 60,
        lease_holder: "agent:a",
      }),
      repo.transition({
        client_id: CLIENT_A,
        ticket_id: task.value.ticket.id,
        verb: "ticket_claim",
        actor: { role: "executor", mandate_ids: [mandate.value.ticket.id] },
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
      actor: { role: "founder" },
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
      actor: { role: "founder" },
      lease_seconds: 30,
      lease_holder: "x",
    });
    expect(foreignClaim.ok).toBe(false);
  });

  it("concurrent create with same idempotency_key on empty tenant yields one ticket", async () => {
    const client = "tickets-e2e-empty-idem";
    const repo = new PgTicketRepository(sql);
    const payload = {
      client_id: client,
      actor: { role: "founder" as const },
      ticket: {
        project: "empty",
        function: "dev" as const,
        kind: "mandate" as const,
        title: "Only one",
        charter: charter(),
      },
      idempotency_key: "empty-tenant-once",
    };
    const [a, b] = await Promise.all([
      repo.create(payload),
      repo.create(payload),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.value.ticket.id).toBe(b.value.ticket.id);
    }
    const count = await sql`
      SELECT count(*)::int AS c FROM tickets WHERE client_id = ${client}
    `;
    expect(count[0]?.c).toBe(1);
  });

  it("expired lease can be re-claimed", async () => {
    const repo = new PgTicketRepository(sql);
    const mandate = await repo.create({
      client_id: CLIENT_A,
      actor: { role: "founder" },
      ticket: {
        project: "reclaim",
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
      actor: { role: "founder" },
    });
    const epic = await repo.create({
      client_id: CLIENT_A,
      actor: { role: "founder" },
      ticket: {
        project: "reclaim",
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
      verb: "ticket_approve",
      actor: { role: "founder" },
    });
    const task = await repo.create({
      client_id: CLIENT_A,
      actor: { role: "executor", mandate_ids: [mandate.value.ticket.id] },
      ticket: {
        project: "reclaim",
        function: "dev",
        kind: "task",
        parent_id: epic.value.ticket.id,
        title: "T",
        risk_tier: "L0",
      },
    });
    if (!task.ok) throw new Error("task");
    const v = task.value.ticket.version;
    const claim = await repo.transition({
      client_id: CLIENT_A,
      ticket_id: task.value.ticket.id,
      verb: "ticket_claim",
      actor: { role: "executor", mandate_ids: [mandate.value.ticket.id] },
      expected_version: v,
      lease_seconds: 1,
      lease_holder: "agent:old",
    });
    expect(claim.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 1100));
    const reclaim = await repo.transition({
      client_id: CLIENT_A,
      ticket_id: task.value.ticket.id,
      verb: "ticket_claim",
      actor: { role: "executor", mandate_ids: [mandate.value.ticket.id] },
      lease_seconds: 120,
      lease_holder: "agent:new",
    });
    expect(reclaim.ok).toBe(true);
    if (reclaim.ok) {
      expect(reclaim.value.ticket.lease_holder).toBe("agent:new");
    }
  });

  it("expected_version mismatch returns VERSION_CONFLICT", async () => {
    const repo = new PgTicketRepository(sql);
    const created = await repo.create({
      client_id: CLIENT_A,
      actor: { role: "founder" },
      ticket: {
        project: "ver",
        function: "dev",
        kind: "mandate",
        title: "M",
        charter: charter(),
      },
    });
    if (!created.ok) throw new Error("setup");
    const bad = await repo.transition({
      client_id: CLIENT_A,
      ticket_id: created.value.ticket.id,
      verb: "ticket_approve",
      actor: { role: "founder" },
      expected_version: 999,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.code).toBe("VERSION_CONFLICT");
    }
  });

  it("concurrent ticket_comment appends monotonic unique event seq", async () => {
    const repo = new PgTicketRepository(sql);
    const created = await repo.create({
      client_id: CLIENT_A,
      actor: { role: "founder" },
      ticket: {
        project: "seq",
        function: "dev",
        kind: "mandate",
        title: "M",
        charter: charter(),
      },
    });
    if (!created.ok) throw new Error("setup");
    const id = created.value.ticket.id;
    const [c1, c2] = await Promise.all([
      repo.transition({
        client_id: CLIENT_A,
        ticket_id: id,
        verb: "ticket_comment",
        actor: { role: "founder" },
        comment: "a",
      }),
      repo.transition({
        client_id: CLIENT_A,
        ticket_id: id,
        verb: "ticket_comment",
        actor: { role: "founder" },
        comment: "b",
      }),
    ]);
    expect(c1.ok && c2.ok).toBe(true);
    const events = await sql`
      SELECT seq FROM ticket_events
      WHERE ticket_id = ${id} AND client_id = ${CLIENT_A}
      ORDER BY seq ASC
    `;
    const seqs = events.map((r) => r.seq as number);
    expect(seqs.length).toBeGreaterThanOrEqual(2);
    expect(new Set(seqs).size).toBe(seqs.length);
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]!);
    }
  });

  it("list is read-only (does not persist incidental reads)", async () => {
    const repo = new PgTicketRepository(sql);
    const created = await repo.create({
      client_id: CLIENT_A,
      actor: { role: "founder" },
      ticket: {
        project: "readonly",
        function: "dev",
        kind: "mandate",
        title: "M",
        charter: charter(),
      },
    });
    if (!created.ok) throw new Error("setup");
    const before = await sql`
      SELECT updated_at FROM tickets WHERE id = ${created.value.ticket.id}
    `;
    const listed = await repo.list({ client_id: CLIENT_A, project: "readonly" });
    expect(listed.ok).toBe(true);
    const after = await sql`
      SELECT updated_at FROM tickets WHERE id = ${created.value.ticket.id}
    `;
    expect(after[0]?.updated_at).toEqual(before[0]?.updated_at);
  });

  it("idempotency_key replay returns the first result", async () => {
    const repo = new PgTicketRepository(sql);
    const mandate = await repo.create({
      client_id: CLIENT_A,
      actor: { role: "founder" },
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
      actor: { role: "founder" },
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

  it("review queue: exception task persists and ticket_review clears unreviewed filter", async () => {
    const repo = new PgTicketRepository(sql);
    const charterWithExc = {
      ...charter(),
      exception_types: [
        {
          type: "incident",
          description: "incident",
          auto_approve: true,
          risk_tier_max: "L1",
        },
      ],
    };
    const mandate = await repo.create({
      client_id: CLIENT_B,
      actor: { role: "founder" },
      ticket: {
        project: "review-q",
        function: "dev",
        kind: "mandate",
        title: "M-review",
        charter: charterWithExc,
      },
    });
    if (!mandate.ok) throw new Error("mandate");
    await repo.transition({
      client_id: CLIENT_B,
      ticket_id: mandate.value.ticket.id,
      verb: "ticket_approve",
      actor: { role: "founder" },
    });
    const exc = await repo.create({
      client_id: CLIENT_B,
      actor: {
        role: "executor",
        mandate_ids: [mandate.value.ticket.id],
        api_key_id: "pg-exec",
      },
      ticket: {
        project: "review-q",
        function: "dev",
        kind: "task",
        parent_id: mandate.value.ticket.id,
        title: "Exc",
        task_class: "exception",
        exception_type: "incident",
        risk_tier: "L0",
      },
    });
    expect(exc.ok).toBe(true);
    if (!exc.ok) return;

    const pending = await repo.list({
      client_id: CLIENT_B,
      requires_review: true,
      reviewed: false,
    });
    expect(pending.ok).toBe(true);
    if (pending.ok) {
      expect(
        pending.value.tickets.some((t) => t.id === exc.value.ticket.id),
      ).toBe(true);
    }

    const done = await repo.transition({
      client_id: CLIENT_B,
      ticket_id: exc.value.ticket.id,
      verb: "ticket_review",
      actor: { role: "integrator", api_key_id: "pg-integrator" },
      review_outcome: "accepted",
    });
    expect(done.ok).toBe(true);

    const after = await repo.list({
      client_id: CLIENT_B,
      requires_review: true,
      reviewed: false,
    });
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(
        after.value.tickets.some((t) => t.id === exc.value.ticket.id),
      ).toBe(false);
    }
  });

  it("proposal inbox: ticket_propose list filter decision_class=proposal status=proposed", async () => {
    const repo = new PgTicketRepository(sql);
    const mandate = await repo.create({
      client_id: CLIENT_A,
      actor: { role: "founder" },
      ticket: {
        project: "prop-inbox",
        function: "dev",
        kind: "mandate",
        title: "M-prop",
        charter: charter(),
      },
    });
    if (!mandate.ok) throw new Error("mandate");
    await repo.transition({
      client_id: CLIENT_A,
      ticket_id: mandate.value.ticket.id,
      verb: "ticket_approve",
      actor: { role: "founder" },
    });
    const proposed = await repo.propose({
      client_id: CLIENT_A,
      actor: {
        role: "executor",
        mandate_ids: [mandate.value.ticket.id],
        api_key_id: "pg-prop-exec",
      },
      parent_id: mandate.value.ticket.id,
      project: "prop-inbox",
      function: "dev",
      proposal_type: "process_change",
      suggested_change: "Change cadence",
      rationale: "Better fit",
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const inbox = await repo.list({
      client_id: CLIENT_A,
      decision_class: "proposal",
      status: "proposed",
      actor: { role: "integrator", api_key_id: "pg-int-prop" },
    });
    expect(inbox.ok).toBe(true);
    if (inbox.ok) {
      expect(
        inbox.value.tickets.some((t) => t.id === proposed.value.ticket.id),
      ).toBe(true);
    }
  });
});
