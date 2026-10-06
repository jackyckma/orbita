import { describe, expect, it } from "vitest";
import { evaluateTransition, initialStatusOnCreate } from "./transitions.js";
import type { MandateCharter } from "./types.js";

const MANDATE = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee0001";

function charter(): MandateCharter {
  return {
    purpose: "p",
    principles: [],
    guardrails: {
      allowed_action_categories: ["dev"],
      forbidden_action_categories: [],
      max_auto_risk_tier: "L1",
    },
    cadence: { description: "d" },
    reporting: { expectations: "e" },
    success_measures: [],
    review_date: "2026-12-31",
    assigned_principals: [],
    hard_limits: [],
    soft_constraints: [],
  };
}

const founder = { role: "founder" as const };
const integrator = { role: "integrator" as const };
const executor = { role: "executor" as const, mandate_ids: [MANDATE] };

describe("permission matrix (roles)", () => {
  it("integrator may create mandate draft", () => {
    const r = initialStatusOnCreate({
      kind: "mandate",
      actor: integrator,
      charter: charter(),
    });
    expect(r).toMatchObject({ ok: true, status: "draft" });
  });

  it("executor cannot create mandate", () => {
    const r = initialStatusOnCreate({
      kind: "mandate",
      actor: executor,
      charter: charter(),
    });
    expect(r.ok).toBe(false);
  });

  it("integrator cannot activate mandate", () => {
    const r = evaluateTransition({
      kind: "mandate",
      status: "draft",
      verb: "ticket_approve",
      actor: integrator,
      source: "native",
      charter: charter(),
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.error.code).toBe("PRIVILEGED_ROLE_REQUIRED");
    }
  });

  it("founder activates mandate", () => {
    const r = evaluateTransition({
      kind: "mandate",
      status: "draft",
      verb: "ticket_approve",
      actor: founder,
      source: "native",
      charter: charter(),
    });
    expect(r).toEqual({ allowed: true, to_status: "active" });
  });

  it("integrator approves epic", () => {
    const r = evaluateTransition({
      kind: "epic",
      status: "proposed",
      verb: "ticket_approve",
      actor: integrator,
      source: "native",
      charter: charter(),
      mandate_id: MANDATE,
      epic_precheck: { ok: true, violations: [] },
    });
    expect(r).toEqual({ allowed: true, to_status: "approved" });
  });

  it("integrator epic approve blocked when precheck fails", () => {
    const r = evaluateTransition({
      kind: "epic",
      status: "proposed",
      verb: "ticket_approve",
      actor: integrator,
      source: "native",
      charter: charter(),
      mandate_id: MANDATE,
      epic_precheck: {
        ok: false,
        violations: [{ code: "X", message: "y" }],
      },
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.error.code).toBe("PRECHECK_FAILED");
    }
  });

  it("decision resolve requires founder", () => {
    const r = evaluateTransition({
      kind: "decision",
      status: "proposed",
      verb: "ticket_approve",
      actor: integrator,
      source: "native",
      charter: charter(),
      mandate_id: MANDATE,
      mandate_status: "active",
      counters: {
        open_epics: 0,
        open_tasks: 0,
        creations_today: 0,
        writes_today: 0,
      },
    });
    expect(r.allowed).toBe(false);
  });
});
