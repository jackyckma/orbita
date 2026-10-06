import type {
  MandateCharter,
  MandateCounters,
  MandateStatus,
  RiskTier,
  TicketFunction,
} from "./types.js";
import { RISK_TIER_ORDER } from "./risk-tier.js";

export type EpicPrecheckViolation = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type EpicPrecheckResult = {
  ok: boolean;
  violations: EpicPrecheckViolation[];
};

export type EpicPrecheckInput = {
  function: TicketFunction;
  risk_tier?: RiskTier;
  charter: MandateCharter;
  counters: MandateCounters;
  mandate_status: MandateStatus;
  /** When true, also require risk within max_auto_risk_tier (auto-approve path). */
  for_auto_approve?: boolean;
};

function riskWithinMax(
  risk: RiskTier | undefined,
  max: RiskTier | undefined,
): boolean {
  if (!risk || !max) {
    return false;
  }
  return RISK_TIER_ORDER[risk] <= RISK_TIER_ORDER[max];
}

/**
 * Structural epic fit checks against mandate charter and counters (no semantic judgement).
 */
export function precheckEpic(input: EpicPrecheckInput): EpicPrecheckResult {
  const violations: EpicPrecheckViolation[] = [];
  const { function: fn, risk_tier, charter, counters, mandate_status } =
    input;
  const { guardrails, hard_limits } = charter;

  if (mandate_status !== "active") {
    violations.push({
      code: "MANDATE_NOT_ACTIVE",
      message: `Epic pre-check requires an active mandate (got ${mandate_status}).`,
      details: { mandate_status },
    });
  }

  const allowed = guardrails.allowed_action_categories ?? [];
  const forbidden = guardrails.forbidden_action_categories ?? [];
  const fnKey = fn;
  if (allowed.length > 0 && !allowed.includes(fnKey)) {
    violations.push({
      code: "FUNCTION_NOT_ALLOWED",
      message: `Epic function ${fnKey} is not in charter allowed_action_categories.`,
      details: { function: fnKey, allowed },
    });
  }
  if (forbidden.includes(fnKey)) {
    violations.push({
      code: "FUNCTION_FORBIDDEN",
      message: `Epic function ${fnKey} is forbidden by charter.`,
      details: { function: fnKey },
    });
  }

  if (risk_tier && forbidden.includes(risk_tier)) {
    violations.push({
      code: "RISK_TIER_FORBIDDEN",
      message: `Risk tier ${risk_tier} is forbidden by charter.`,
      details: { risk_tier },
    });
  }

  if (input.for_auto_approve) {
    const max = guardrails.max_auto_risk_tier;
    if (!riskWithinMax(risk_tier, max)) {
      violations.push({
        code: "RISK_ABOVE_AUTO_CEILING",
        message: "Risk tier exceeds charter max_auto_risk_tier for auto-approve.",
        details: { risk_tier, max_auto_risk_tier: max },
      });
    }
  }

  for (const limit of hard_limits) {
    if (limit.enforcement !== "server") {
      continue;
    }
    if (
      limit.max_open_epics !== undefined &&
      counters.open_epics >= limit.max_open_epics
    ) {
      violations.push({
        code: "MAX_OPEN_EPICS",
        message: `Hard limit ${limit.id}: max_open_epics (${limit.max_open_epics}) reached.`,
        details: {
          limit_id: limit.id,
          open_epics: counters.open_epics,
          max_open_epics: limit.max_open_epics,
        },
      });
    }
  }

  return { ok: violations.length === 0, violations };
}
