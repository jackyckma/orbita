import { describe, expect, it } from "vitest";
import { precheckEpic } from "./precheck-epic.js";
import type { MandateCharter } from "./types.js";

function charter(overrides?: Partial<MandateCharter>): MandateCharter {
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
    ...overrides,
  };
}

describe("precheckEpic", () => {
  it("passes when mandate active and function allowed", () => {
    const r = precheckEpic({
      function: "dev",
      risk_tier: "L0",
      charter: charter(),
      counters: {
        open_epics: 0,
        open_tasks: 0,
        creations_today: 0,
        writes_today: 0,
      },
      mandate_status: "active",
    });
    expect(r.ok).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it("fails when function not allowed", () => {
    const r = precheckEpic({
      function: "marketing",
      charter: charter(),
      counters: {
        open_epics: 0,
        open_tasks: 0,
        creations_today: 0,
        writes_today: 0,
      },
      mandate_status: "active",
    });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.code === "FUNCTION_NOT_ALLOWED")).toBe(
      true,
    );
  });
});
