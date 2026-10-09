/**
 * Synthetic executor-day REST smoke (tier A). Orchestrated by scripts/tickets-bot-loop-smoke.sh
 * which starts Postgres + API with ORBITA_TICKETS_ENABLED=1 and role key env.
 */
import { describe, expect, it } from "vitest";
import { authHeaders, e2eBaseUrl } from "./helpers.js";

const run =
  process.env.E2E_TICKETS_BOT_LOOP === "1" &&
  process.env.TICKETS_BOT_LOOP_FOUNDER_KEY &&
  process.env.TICKETS_BOT_LOOP_INTEGRATOR_KEY &&
  process.env.TICKETS_BOT_LOOP_EXECUTOR_KEY &&
  process.env.TICKETS_BOT_LOOP_MANDATE_ID;

const BASE = e2eBaseUrl();
const CLIENT = process.env.TICKETS_BOT_LOOP_CLIENT ?? "tickets-bot-loop";

function charter() {
  return {
    purpose: "bot-loop smoke",
    principles: ["stay within guardrails"],
    guardrails: {
      allowed_action_categories: ["dev", "L0"],
      forbidden_action_categories: [],
      max_auto_risk_tier: "L1",
    },
    approval_policy: { epics: "integrator", tasks: "auto" },
    cadence: { description: "on demand" },
    reporting: { expectations: "none" },
    success_measures: ["smoke green"],
    review_date: "2026-12-31",
    assigned_principals: ["founder"],
    hard_limits: [],
    soft_constraints: [],
  };
}

async function postJson(
  path: string,
  auth: Record<string, string>,
  body: unknown,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

describe.skipIf(!run)("tickets bot-loop smoke (REST)", () => {
  const founderKey = process.env.TICKETS_BOT_LOOP_FOUNDER_KEY!;
  const integratorKey = process.env.TICKETS_BOT_LOOP_INTEGRATOR_KEY!;
  const executorKey = process.env.TICKETS_BOT_LOOP_EXECUTOR_KEY!;
  const mandateId = process.env.TICKETS_BOT_LOOP_MANDATE_ID!;

  const founderAuth = authHeaders(founderKey, CLIENT);
  const integratorAuth = authHeaders(integratorKey, CLIENT);
  const executorAuth = authHeaders(executorKey, CLIENT);

  it("executor day: epic approve, task lifecycle, propose/resolve", async () => {
    const epicRes = await postJson("/v1/tickets", executorAuth, {
      ticket: {
        project: "bot-loop",
        function: "dev",
        kind: "epic",
        parent_id: mandateId,
        title: "Smoke epic",
        risk_tier: "L0",
        acceptance_criteria: ["done"],
      },
    });
    expect(epicRes.status).toBe(200);
    const epic = (epicRes.json as { ticket: { id: string; status: string } }).ticket;
    expect(epic.status).toBe("proposed");

    const approveEpic = await postJson("/v1/tickets/ticket_approve", integratorAuth, {
      ticket_id: epic.id,
    });
    expect(approveEpic.status).toBe(200);
    const approvedEpic = (approveEpic.json as { ticket: { status: string }; precheck?: { ok: boolean } })
      .ticket;
    expect(approvedEpic.status).toBe("approved");
    const precheck = (approveEpic.json as { precheck?: { ok: boolean } }).precheck;
    if (precheck) {
      expect(precheck.ok).toBe(true);
    }

    const taskRes = await postJson("/v1/tickets", executorAuth, {
      ticket: {
        project: "bot-loop",
        function: "dev",
        kind: "task",
        parent_id: epic.id,
        title: "Smoke task",
        risk_tier: "L0",
      },
    });
    expect(taskRes.status).toBe(200);
    const task = (taskRes.json as { ticket: { id: string; status: string } }).ticket;
    expect(task.status).toBe("approved");

    const claim = await postJson("/v1/tickets/ticket_claim", executorAuth, {
      ticket_id: task.id,
      lease_holder: "bot-loop-executor",
      lease_seconds: 3600,
    });
    expect(claim.status).toBe(200);

    const progress1 = await postJson("/v1/tickets/ticket_progress", executorAuth, {
      ticket_id: task.id,
    });
    expect(progress1.status).toBe(200);

    const progress2 = await postJson("/v1/tickets/ticket_progress", executorAuth, {
      ticket_id: task.id,
    });
    expect(progress2.status).toBe(200);

    const complete = await postJson("/v1/tickets/ticket_complete", executorAuth, {
      ticket_id: task.id,
      result_refs: { note: "tier-a://bot-loop/result-1" },
    });
    expect(complete.status).toBe(200);
    const done = (complete.json as { ticket: { status: string } }).ticket;
    expect(done.status).toBe("done");

    const comment = await postJson("/v1/tickets/ticket_comment", executorAuth, {
      ticket_id: task.id,
      comment: "smoke complete",
    });
    expect(comment.status).toBe(200);

    const propose = await postJson("/v1/tickets/ticket_propose", executorAuth, {
      parent_id: mandateId,
      project: "bot-loop",
      function: "dev",
      proposal_type: "process_change",
      suggested_change: "Add weekly digest",
      rationale: "Smoke proposal round-trip",
      risk_tier: "L0",
    });
    expect(propose.status).toBe(200);
    const proposal = (propose.json as { ticket: { id: string; status: string } }).ticket;
    expect(proposal.status).toBe("proposed");

    const resolve = await postJson("/v1/tickets/ticket_resolve", integratorAuth, {
      ticket_id: proposal.id,
      outcome: "accepted",
      response: "Noted for smoke",
    });
    expect(resolve.status).toBe(200);
    const resolved = (resolve.json as { ticket: { status: string } }).ticket;
    expect(resolved.status).toBe("done");
  });
});
