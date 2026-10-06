import { describe, expect, it } from "vitest";
import { FakeTicketRepository } from "./fake-repository.js";
import type { MandateCharter } from "./types.js";

const CLIENT_A = "tenant-a";
const CLIENT_B = "tenant-b";

function charter(): MandateCharter {
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
    soft_constraints: [
      {
        id: "effort",
        description: "effort",
        metric: "effort_budget",
        warn_threshold: 5,
        block_threshold: 10,
      },
    ],
  };
}

describe("FakeTicketRepository tenant isolation", () => {
  it("client A cannot read client B ticket", async () => {
    const repo = new FakeTicketRepository();
    const created = await repo.create({
      client_id: CLIENT_A,
      actor: { type: "human" },
      ticket: {
        project: "orbita",
        function: "dev",
        kind: "mandate",
        title: "Mandate A",
        charter: charter(),
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const foreign = await repo.get({
      client_id: CLIENT_B,
      ticket_id: created.value.ticket.id,
    });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) {
      expect(foreign.error.code).toBe("NOT_FOUND");
    }
  });
});

describe("FakeTicketRepository claim and idempotency", () => {
  it("claim uses expected_version and idempotency replay", async () => {
    const repo = new FakeTicketRepository();
    const mandate = await repo.create({
      client_id: CLIENT_A,
      actor: { type: "human" },
      ticket: {
        project: "p",
        function: "dev",
        kind: "mandate",
        title: "M",
        charter: charter(),
      },
    });
    if (!mandate.ok) {
      throw new Error("setup failed");
    }
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
        project: "p",
        function: "dev",
        kind: "epic",
        parent_id: mandate.value.ticket.id,
        title: "E",
        acceptance_criteria: ["done"],
        risk_tier: "L0",
      },
    });
    if (!epic.ok) {
      throw new Error("epic failed");
    }
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
        project: "p",
        function: "dev",
        kind: "task",
        parent_id: epic.value.ticket.id,
        title: "T",
        risk_tier: "L0",
      },
    });
    if (!task.ok) {
      throw new Error(`task failed ${JSON.stringify(task)}`);
    }

    const claim = await repo.transition({
      client_id: CLIENT_A,
      ticket_id: task.value.ticket.id,
      verb: "ticket_claim",
      actor: { type: "agent", mandate_ids: [mandate.value.ticket.id] },
      expected_version: task.value.ticket.version,
      lease_seconds: 120,
      lease_holder: "agent:worker",
      idempotency_key: "claim-1",
    });
    expect(claim.ok).toBe(true);
    if (claim.ok) {
      expect(claim.value.ticket.status).toBe("claimed");
      expect(claim.value.ticket.lease_holder).toBe("agent:worker");
    }

    const replay = await repo.transition({
      client_id: CLIENT_A,
      ticket_id: task.value.ticket.id,
      verb: "ticket_claim",
      actor: { type: "agent", mandate_ids: [mandate.value.ticket.id] },
      lease_seconds: 120,
      lease_holder: "agent:worker",
      idempotency_key: "claim-1",
    });
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.value.replayed).toBe(true);
    }

    const conflict = await repo.transition({
      client_id: CLIENT_A,
      ticket_id: task.value.ticket.id,
      verb: "ticket_claim",
      actor: { type: "agent", mandate_ids: [mandate.value.ticket.id] },
      expected_version: 1,
      lease_seconds: 120,
      lease_holder: "agent:other",
    });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) {
      expect(conflict.error.code).toBe("VERSION_CONFLICT");
    }
  });
});

describe("FakeTicketRepository list filters", () => {
  it("filters by project and paginates with cursor", async () => {
    const repo = new FakeTicketRepository();
    await repo.create({
      client_id: CLIENT_A,
      actor: { type: "human" },
      ticket: {
        project: "alpha",
        function: "dev",
        kind: "mandate",
        title: "M1",
        charter: charter(),
      },
    });
    await repo.create({
      client_id: CLIENT_A,
      actor: { type: "human" },
      ticket: {
        project: "beta",
        function: "dev",
        kind: "mandate",
        title: "M2",
        charter: charter(),
      },
    });
    const listed = await repo.list({
      client_id: CLIENT_A,
      project: "alpha",
      limit: 10,
    });
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.value.tickets.every((t) => t.project === "alpha")).toBe(
        true,
      );
    }
  });
});

describe("FakeTicketRepository mandate subtree health", () => {
  it("returns counts and last activity", async () => {
    const repo = new FakeTicketRepository();
    const mandate = await repo.create({
      client_id: CLIENT_A,
      actor: { type: "human" },
      ticket: {
        project: "p",
        function: "dev",
        kind: "mandate",
        title: "M",
        charter: charter(),
      },
    });
    if (!mandate.ok) {
      throw new Error("setup");
    }
    const health = await repo.getMandateSubtreeHealth(
      CLIENT_A,
      mandate.value.ticket.id,
    );
    expect(health.ok).toBe(true);
    if (health.ok) {
      expect(health.value.counts_by_status.draft).toBeGreaterThanOrEqual(1);
      expect(health.value.last_activity_at).toBeTruthy();
    }
  });
});

describe("FakeTicketRepository lease expiry", () => {
  it("frees an expired lease so ticket_claim can succeed", async () => {
    const repo = new FakeTicketRepository();
    const mandate = await repo.create({
      client_id: CLIENT_A,
      actor: { type: "human" },
      ticket: {
        project: "p",
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
        project: "p",
        function: "dev",
        kind: "epic",
        parent_id: mandate.value.ticket.id,
        title: "E",
        acceptance_criteria: ["done"],
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
        project: "p",
        function: "dev",
        kind: "task",
        parent_id: epic.value.ticket.id,
        title: "T",
        risk_tier: "L0",
      },
    });
    if (!task.ok) throw new Error("task");
    const first = await repo.transition({
      client_id: CLIENT_A,
      ticket_id: task.value.ticket.id,
      verb: "ticket_claim",
      actor: { type: "agent", mandate_ids: [mandate.value.ticket.id] },
      expected_version: task.value.ticket.version,
      lease_seconds: 1,
      lease_holder: "agent:old",
    });
    expect(first.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 1100));
    const reclaim = await repo.transition({
      client_id: CLIENT_A,
      ticket_id: task.value.ticket.id,
      verb: "ticket_claim",
      actor: { type: "agent", mandate_ids: [mandate.value.ticket.id] },
      lease_seconds: 120,
      lease_holder: "agent:new",
    });
    expect(reclaim.ok).toBe(true);
    if (reclaim.ok) {
      expect(reclaim.value.ticket.lease_holder).toBe("agent:new");
    }
  });
});

describe("FakeTicketRepository soft_breach events", () => {
  it("persists soft_breach rows without blocking reads", async () => {
    const repo = new FakeTicketRepository();
    const mandate = await repo.create({
      client_id: CLIENT_A,
      actor: { type: "human" },
      ticket: {
        project: "p",
        function: "dev",
        kind: "mandate",
        title: "M",
        charter: charter(),
      },
    });
    if (!mandate.ok) {
      throw new Error("setup");
    }
    const id = mandate.value.ticket.id;
    await repo.transition({
      client_id: CLIENT_A,
      ticket_id: id,
      verb: "ticket_approve",
      actor: { type: "human" },
    });
    const comment = await repo.transition({
      client_id: CLIENT_A,
      ticket_id: id,
      verb: "ticket_comment",
      actor: { type: "human" },
      soft_observations: { effort: 6 },
      comment: "warn threshold crossed",
    });
    expect(comment.ok).toBe(true);
    const got = await repo.get({
      client_id: CLIENT_A,
      ticket_id: id,
      include_events: true,
    });
    expect(got.ok).toBe(true);
    if (got.ok && got.value.events) {
      const breach = got.value.events.find(
        (e) =>
          e.payload &&
          (e.payload as { event_kind?: string }).event_kind === "soft_breach",
      );
      expect(breach).toBeTruthy();
    }
  });
});
