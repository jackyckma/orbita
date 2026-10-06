import type { Actor, MandateCharter } from "./types.js";
import { canUpdateCharter, isFounder } from "./roles.js";

export type CharterPatch = Partial<
  Pick<
    MandateCharter,
    | "purpose"
    | "principles"
    | "cadence"
    | "reporting"
    | "success_measures"
    | "soft_constraints"
    | "exception_types"
    | "guardrails"
    | "approval_policy"
    | "hard_limits"
    | "assigned_principals"
    | "review_date"
  >
>;

export type CharterChangeDiff = {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

const INTEGRATOR_FIELDS = new Set([
  "purpose",
  "principles",
  "cadence",
  "reporting",
  "success_measures",
  "soft_constraints",
  "exception_types",
  "approval_policy",
  "review_date",
]);

const FOUNDER_ONLY_FIELDS = new Set(["hard_limits", "assigned_principals"]);

export type CharterUpdateDeny = {
  ok: false;
  code: "PRIVILEGED_ROLE_REQUIRED" | "INVALID_TRANSITION";
  message: string;
};

export type CharterUpdateAllow = {
  ok: true;
  charter: MandateCharter;
  diff: CharterChangeDiff;
};

export function applyCharterPatch(
  actor: Actor,
  current: MandateCharter,
  patch: CharterPatch,
): CharterUpdateAllow | CharterUpdateDeny {
  if (!canUpdateCharter(actor)) {
    return {
      ok: false,
      code: "PRIVILEGED_ROLE_REQUIRED",
      message: "Updating a mandate charter requires founder or integrator.",
    };
  }

  const keys = Object.keys(patch) as (keyof CharterPatch)[];
  if (keys.length === 0) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      message: "Charter patch must include at least one field.",
    };
  }

  for (const key of keys) {
    if (FOUNDER_ONLY_FIELDS.has(key) && !isFounder(actor)) {
      return {
        ok: false,
        code: "PRIVILEGED_ROLE_REQUIRED",
        message: `Changing charter field ${key} requires a founder.`,
      };
    }
    if (!INTEGRATOR_FIELDS.has(key) && !FOUNDER_ONLY_FIELDS.has(key)) {
      return {
        ok: false,
        code: "INVALID_TRANSITION",
        message: `Charter field ${key} cannot be updated via ticket_update_charter.`,
      };
    }
  }

  if (patch.guardrails !== undefined && !isFounder(actor)) {
    const currentHard = current.guardrails;
    const nextHard = patch.guardrails;
    const hardKeys = [
      "forbidden_action_categories",
      "max_auto_risk_tier",
    ] as const;
    for (const hk of hardKeys) {
      if (
        nextHard[hk] !== undefined &&
        JSON.stringify(nextHard[hk]) !== JSON.stringify(currentHard[hk])
      ) {
        return {
          ok: false,
          code: "PRIVILEGED_ROLE_REQUIRED",
          message: `Changing guardrails.${hk} requires a founder.`,
        };
      }
    }
  }

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const next: MandateCharter = { ...current };

  for (const key of keys) {
    const prev = (current as unknown as Record<string, unknown>)[key];
    const val = (patch as unknown as Record<string, unknown>)[key];
    before[key] = prev;
    after[key] = val;
    (next as unknown as Record<string, unknown>)[key] = val;
  }

  if (patch.guardrails !== undefined) {
    next.guardrails = {
      ...current.guardrails,
      ...patch.guardrails,
      allowed_action_categories:
        patch.guardrails.allowed_action_categories ??
        current.guardrails.allowed_action_categories,
      forbidden_action_categories:
        patch.guardrails.forbidden_action_categories ??
        current.guardrails.forbidden_action_categories,
    };
  }

  return {
    ok: true,
    charter: next,
    diff: { before, after },
  };
}
