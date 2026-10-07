import { describe, expect, it } from "vitest";
import { FakeTicketRepository } from "./fake-repository.js";
import {
  markProposalUntrustedForPrivilegedReader,
  viewTicketForActor,
} from "./proposals.js";
import type { MandateCharter } from "./types.js";

const CLIENT = "proposals-client";

function charter(overrides?: Partial<MandateCharter>): MandateCharter {
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
    max_open_proposals: 5,
    ...overrides,
  };
}

async function activeMandate(repo: FakeTicketRepository) {
  const mandate = await repo.create({
    client_id: CLIENT,
    actor: { role: "founder" },
    ticket: {
      project: "p",
      function: "dev",
      kind: "mandate",
      title: "M",
      charter: charter(),
    },
  });
  if (!mandate.ok) throw new Error("mandate");
  await repo.transition({
    client_id: CLIENT,
    ticket_id: mandate.value.ticket.id,
    verb: "ticket_approve",
    actor: { role: "founder" },
  });
  return mandate.value.ticket.id;
}

describe("ticket_propose and ticket_resolve", () => {
  it("creates proposal under mandate and integrator resolves process_change", async () => {
    const repo = new FakeTicketRepository();
    const mandateId = await activeMandate(repo);
    const proposed = await repo.propose({
      client_id: CLIENT,
      actor: {
        role: "executor",
        mandate_ids: [mandateId],
        api_key_id: "exec-a",
      },
      parent_id: mandateId,
      project: "p",
      function: "dev",
      proposal_type: "process_change",
      suggested_change: "Try weekly sync",
      rationale: "Faster feedback",
      risk_tier: "L0",
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    expect(proposed.value.ticket.decision_class).toBe("proposal");
    expect(proposed.value.ticket.status).toBe("proposed");

    const inbox = await repo.list({
      client_id: CLIENT,
      decision_class: "proposal",
      status: "proposed",
      actor: { role: "integrator", api_key_id: "int-1" },
    });
    expect(inbox.ok).toBe(true);
    if (inbox.ok) {
      expect(inbox.value.tickets.length).toBeGreaterThanOrEqual(1);
    }

    const resolved = await repo.transition({
      client_id: CLIENT,
      ticket_id: proposed.value.ticket.id,
      verb: "ticket_resolve",
      actor: { role: "integrator", api_key_id: "int-1" },
      proposal_resolve_outcome: "accepted",
      proposal_response: "Approved for trial",
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.value.ticket.status).toBe("done");
      expect(resolved.value.ticket.proposal_outcome).toBe("accepted");
    }
  });

  it("denies integrator resolving founder-only proposal types", async () => {
    const repo = new FakeTicketRepository();
    const mandateId = await activeMandate(repo);
    const proposed = await repo.propose({
      client_id: CLIENT,
      actor: {
        role: "executor",
        mandate_ids: [mandateId],
        api_key_id: "exec-b",
      },
      parent_id: mandateId,
      project: "p",
      function: "dev",
      proposal_type: "charter_change_request",
      suggested_change: "Loosen cap",
      rationale: "Need headroom",
    });
    if (!proposed.ok) throw new Error("propose");
    const denied = await repo.transition({
      client_id: CLIENT,
      ticket_id: proposed.value.ticket.id,
      verb: "ticket_resolve",
      actor: { role: "integrator", api_key_id: "int-1" },
      proposal_resolve_outcome: "accepted",
      proposal_response: "ok",
    });
    expect(denied.ok).toBe(false);
  });

  it("isolates cross-mandate proposals from other executors", async () => {
    const repo = new FakeTicketRepository();
    const mandateA = await activeMandate(repo);
    const mandateB = await repo.create({
      client_id: CLIENT,
      actor: { role: "founder" },
      ticket: {
        project: "p2",
        function: "dev",
        kind: "mandate",
        title: "M2",
        charter: charter(),
      },
    });
    if (!mandateB.ok) throw new Error("m2");
    await repo.transition({
      client_id: CLIENT,
      ticket_id: mandateB.value.ticket.id,
      verb: "ticket_approve",
      actor: { role: "founder" },
    });

    const proposed = await repo.propose({
      client_id: CLIENT,
      actor: {
        role: "executor",
        mandate_ids: [mandateA],
        api_key_id: "exec-a",
      },
      parent_id: mandateA,
      project: "p",
      function: "dev",
      proposal_type: "cross_agent_suggestion",
      suggested_change: "Research bot should cite sources",
      rationale: "Quality",
      target: { mandate_id: mandateB.value.ticket.id },
    });
    if (!proposed.ok) throw new Error("propose");

    const foreignGet = await repo.get({
      client_id: CLIENT,
      ticket_id: proposed.value.ticket.id,
      actor: {
        role: "executor",
        mandate_ids: [mandateB.value.ticket.id],
        api_key_id: "exec-b",
      },
    });
    expect(foreignGet.ok).toBe(false);
  });

  it("inputs_from round-trips and is marked untrusted for integrator", async () => {
    const repo = new FakeTicketRepository();
    const mandateId = await activeMandate(repo);
    const proposed = await repo.propose({
      client_id: CLIENT,
      actor: {
        role: "executor",
        mandate_ids: [mandateId],
        api_key_id: "exec-c",
      },
      parent_id: mandateId,
      project: "p",
      function: "dev",
      proposal_type: "other",
      suggested_change: "Idea from chat",
      rationale: "Discussed with research bot",
      inputs_from: [
        { kind: "chat", ref: "grok-group-thread-1", from: "research bot" },
      ],
    });
    if (!proposed.ok) throw new Error("propose");
    const viewed = viewTicketForActor(proposed.value.ticket, {
      role: "integrator",
      api_key_id: "int-1",
    });
    const marked = markProposalUntrustedForPrivilegedReader(proposed.value.ticket);
    expect(marked.suggested_change).toEqual({
      value: "Idea from chat",
      untrusted_author: true,
    });
    expect(viewed.rationale).toEqual({
      value: "Discussed with research bot",
      untrusted_author: true,
    });
  });

  it("denies executor attaching unreadable ticket input", async () => {
    const repo = new FakeTicketRepository();
    const mandateA = await activeMandate(repo);
    const mandateB = await repo.create({
      client_id: CLIENT,
      actor: { role: "founder" },
      ticket: {
        project: "p3",
        function: "dev",
        kind: "mandate",
        title: "M3",
        charter: charter(),
      },
    });
    if (!mandateB.ok) throw new Error("m3");
    await repo.transition({
      client_id: CLIENT,
      ticket_id: mandateB.value.ticket.id,
      verb: "ticket_approve",
      actor: { role: "founder" },
    });
    const foreignTask = await repo.create({
      client_id: CLIENT,
      actor: { role: "founder" },
      ticket: {
        project: "p3",
        function: "dev",
        kind: "epic",
        parent_id: mandateB.value.ticket.id,
        title: "E",
        acceptance_criteria: ["x"],
        risk_tier: "L0",
      },
    });
    if (!foreignTask.ok) throw new Error("epic");

    const denied = await repo.propose({
      client_id: CLIENT,
      actor: {
        role: "executor",
        mandate_ids: [mandateA],
        api_key_id: "exec-a",
      },
      parent_id: mandateA,
      project: "p",
      function: "dev",
      proposal_type: "other",
      suggested_change: "x",
      rationale: "y",
      inputs_from: [
        { kind: "ticket", ref: foreignTask.value.ticket.id },
      ],
    });
    expect(denied.ok).toBe(false);
  });
});
