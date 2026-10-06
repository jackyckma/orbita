import { describe, expect, it } from "vitest";
import { FakeTicketRepository } from "./fake-repository.js";
import type { MandateCharter } from "./types.js";

const CLIENT = "exception-review";

function charterWithExceptions(): MandateCharter {
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
    exception_types: [
      {
        type: "incident",
        description: "Production incident",
        auto_approve: true,
        risk_tier_max: "L1",
        max_open: 2,
      },
    ],
  };
}

describe("exception tasks and ticket_review", () => {
  it("creates exception task under mandate and lists review queue", async () => {
    const repo = new FakeTicketRepository();
    const mandate = await repo.create({
      client_id: CLIENT,
      actor: { role: "founder" },
      ticket: {
        project: "p",
        function: "dev",
        kind: "mandate",
        title: "M",
        charter: charterWithExceptions(),
      },
    });
    expect(mandate.ok).toBe(true);
    if (!mandate.ok) return;

    await repo.transition({
      client_id: CLIENT,
      ticket_id: mandate.value.ticket.id,
      verb: "ticket_approve",
      actor: { role: "founder" },
    });

    const exc = await repo.create({
      client_id: CLIENT,
      actor: {
        role: "executor",
        mandate_ids: [mandate.value.ticket.id],
        api_key_id: "exec-key",
      },
      ticket: {
        project: "p",
        function: "dev",
        kind: "task",
        parent_id: mandate.value.ticket.id,
        title: "Hotfix",
        task_class: "exception",
        exception_type: "incident",
        risk_tier: "L0",
      },
    });
    expect(exc.ok).toBe(true);
    if (!exc.ok) return;
    expect(exc.value.ticket.task_class).toBe("exception");
    expect(exc.value.ticket.requires_review).toBe(true);
    expect(exc.value.ticket.status).toBe("approved");

    const queue = await repo.list({
      client_id: CLIENT,
      requires_review: true,
      reviewed: false,
    });
    expect(queue.ok).toBe(true);
    if (queue.ok) {
      expect(queue.value.tickets.some((t) => t.id === exc.value.ticket.id)).toBe(
        true,
      );
    }

    const reviewed = await repo.transition({
      client_id: CLIENT,
      ticket_id: exc.value.ticket.id,
      verb: "ticket_review",
      actor: { role: "integrator", api_key_id: "integrator-key" },
      review_outcome: "accepted",
    });
    expect(reviewed.ok).toBe(true);
    if (reviewed.ok) {
      expect(reviewed.value.ticket.reviewed_at).toBeTruthy();
      expect(reviewed.value.event.payload?.event_kind).toBe("reviewed");
    }
  });

  it("denies self-review by create actor api_key_id", async () => {
    const repo = new FakeTicketRepository();
    const mandate = await repo.create({
      client_id: CLIENT,
      actor: { role: "founder" },
      ticket: {
        project: "p2",
        function: "dev",
        kind: "mandate",
        title: "M2",
        charter: charterWithExceptions(),
      },
    });
    if (!mandate.ok) throw new Error("setup");
    await repo.transition({
      client_id: CLIENT,
      ticket_id: mandate.value.ticket.id,
      verb: "ticket_approve",
      actor: { role: "founder" },
    });
    const exc = await repo.create({
      client_id: CLIENT,
      actor: {
        role: "executor",
        mandate_ids: [mandate.value.ticket.id],
        api_key_id: "same-key",
      },
      ticket: {
        project: "p2",
        function: "dev",
        kind: "task",
        parent_id: mandate.value.ticket.id,
        title: "Fix",
        task_class: "exception",
        exception_type: "incident",
        risk_tier: "L0",
      },
    });
    if (!exc.ok) throw new Error("exc");
    const denied = await repo.transition({
      client_id: CLIENT,
      ticket_id: exc.value.ticket.id,
      verb: "ticket_review",
      actor: { role: "founder", api_key_id: "same-key" },
      review_outcome: "accepted",
    });
    expect(denied.ok).toBe(false);
  });
});
