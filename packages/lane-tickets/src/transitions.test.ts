import { describe, expect, it } from "vitest";
import {
  ALL_VERBS,
  evaluateTransition,
  initialStatusOnCreate,
  statusesForKind,
  validateParentForCreate,
} from "./transitions.js";
import type {
  MandateCharter,
  MandateStatus,
  ParentTicketRef,
  TicketKind,
  TicketVerb,
  TransitionInput,
} from "./types.js";

const MANDATE_UUID = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee0001";
const EPIC_UUID = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee0002";

function emptyCharter(overrides?: Partial<MandateCharter>): MandateCharter {
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
    ...overrides,
  };
}

function baseInput(
  partial: Partial<TransitionInput> & Pick<TransitionInput, "kind" | "status" | "verb">,
): TransitionInput {
  const kind = partial.kind;
  const status = partial.status;
  return {
    actor: { type: "agent", mandate_ids: [MANDATE_UUID] },
    source: "native",
    charter: emptyCharter(),
    mandate_id: MANDATE_UUID,
    mandate_status:
      kind === "mandate" ? (status as MandateStatus) : "active",
    open_children_count: kind === "epic" ? 0 : undefined,
    ...partial,
  };
}

const human = { type: "human" as const };
const agent = { type: "agent" as const, mandate_ids: [MANDATE_UUID] };

const activeMandateParent: ParentTicketRef = {
  kind: "mandate",
  status: "active",
  mandate_id: MANDATE_UUID,
};

const approvedEpicParent: ParentTicketRef = {
  kind: "epic",
  status: "approved",
  mandate_id: MANDATE_UUID,
};

describe("evaluateTransition — git read-only", () => {
  it("rejects mutating verbs on git tickets with GIT_READ_ONLY", () => {
    const r = evaluateTransition(
      baseInput({
        kind: "task",
        status: "approved",
        verb: "ticket_claim",
        source: "git",
        git_ref: "docs/autopilot/backlog.json",
      }),
    );
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.error.code).toBe("GIT_READ_ONLY");
    }
  });

  it("allows ticket_list on git tickets", () => {
    const r = evaluateTransition(
      baseInput({
        kind: "task",
        status: "approved",
        verb: "ticket_list",
        source: "git",
      }),
    );
    expect(r.allowed).toBe(true);
  });
});

describe("evaluateTransition — human gates", () => {
  it("requires human for proposed→approved", () => {
    const r = evaluateTransition(
      baseInput({ kind: "epic", status: "proposed", verb: "ticket_approve", actor: agent }),
    );
    expect(r).toEqual({
      allowed: false,
      error: {
        code: "HUMAN_ACTOR_REQUIRED",
        message: "Approving an epic requires a human actor.",
      },
    });
  });

  it("allows human approve on epic", () => {
    const r = evaluateTransition(
      baseInput({ kind: "epic", status: "proposed", verb: "ticket_approve", actor: human }),
    );
    expect(r).toEqual({ allowed: true, to_status: "approved" });
  });
});

describe("evaluateTransition — hard limits", () => {
  const charter = emptyCharter({
    hard_limits: [
      {
        id: "cap_epics",
        description: "cap",
        enforcement: "server",
        max_open_epics: 2,
      },
    ],
  });

  it("denies epic create when at cap", () => {
    const r = evaluateTransition({
      kind: "mandate",
      status: "active",
      verb: "ticket_create",
      actor: agent,
      source: "native",
      charter,
      create_kind: "epic",
      counters: { open_epics: 2, open_tasks: 0, creations_today: 0, writes_today: 0 },
      parent: activeMandateParent,
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.error.code).toBe("HARD_LIMIT_EXCEEDED");
    }
  });

  it("denies when server hard limits exist but counters missing", () => {
    const r = evaluateTransition({
      kind: "task",
      status: "approved",
      verb: "ticket_claim",
      actor: agent,
      source: "native",
      charter,
      mandate_id: MANDATE_UUID,
      mandate_status: "active",
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.error.code).toBe("HARD_LIMIT_COUNTERS_MISSING");
    }
  });
});

describe("evaluateTransition — soft_breach hints", () => {
  it("records warn-only soft breach without blocking", () => {
    const charter = emptyCharter({
      soft_constraints: [
        {
          id: "effort",
          description: "effort",
          metric: "effort_budget",
          warn_threshold: 10,
        },
      ],
    });
    const r = evaluateTransition({
      kind: "task",
      status: "in_progress",
      verb: "ticket_comment",
      actor: agent,
      source: "native",
      charter,
      mandate_id: MANDATE_UUID,
      soft_observations: { effort: 12 },
    });
    expect(r.allowed).toBe(true);
    if (r.allowed) {
      expect(r.record_soft_breach?.[0]?.threshold_kind).toBe("warn");
    }
  });

  it("allows ticket_get when block_threshold exceeded", () => {
    const charter = emptyCharter({
      soft_constraints: [
        {
          id: "effort",
          description: "effort",
          metric: "effort_budget",
          warn_threshold: 10,
          block_threshold: 20,
        },
      ],
    });
    const r = evaluateTransition({
      kind: "task",
      status: "in_progress",
      verb: "ticket_get",
      actor: agent,
      source: "native",
      charter,
      mandate_id: MANDATE_UUID,
      mandate_status: "active",
      soft_observations: { effort: 25 },
    });
    expect(r.allowed).toBe(true);
  });

  it("denies when block_threshold exceeded", () => {
    const charter = emptyCharter({
      soft_constraints: [
        {
          id: "effort",
          description: "effort",
          metric: "effort_budget",
          warn_threshold: 10,
          block_threshold: 20,
        },
      ],
    });
    const r = evaluateTransition({
      kind: "task",
      status: "in_progress",
      verb: "ticket_progress",
      actor: agent,
      source: "native",
      charter,
      mandate_id: MANDATE_UUID,
      mandate_status: "active",
      counters: { open_epics: 0, open_tasks: 0, creations_today: 0, writes_today: 0 },
      soft_observations: { effort: 25 },
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.error.code).toBe("SOFT_BLOCK_THRESHOLD_EXCEEDED");
      expect(r.record_soft_breach?.[0]?.threshold_kind).toBe("block");
    }
  });
});

describe("mandate pause gate", () => {
  it("blocks agent claim when mandate paused", () => {
    const r = evaluateTransition(
      baseInput({
        kind: "task",
        status: "approved",
        verb: "ticket_claim",
        actor: agent,
        mandate_status: "paused",
        mandate_id: MANDATE_UUID,
        counters: { open_epics: 0, open_tasks: 0, creations_today: 0, writes_today: 0 },
      }),
    );
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.error.code).toBe("MANDATE_NOT_ACTIVE");
    }
  });

  it("still allows ticket_block for agents under paused mandate", () => {
    const r = evaluateTransition(
      baseInput({
        kind: "task",
        status: "in_progress",
        verb: "ticket_block",
        actor: agent,
        mandate_status: "paused",
        mandate_id: MANDATE_UUID,
      }),
    );
    expect(r.allowed).toBe(true);
  });

  it("does not block human claim when mandate paused", () => {
    const r = evaluateTransition(
      baseInput({
        kind: "task",
        status: "approved",
        verb: "ticket_claim",
        actor: human,
        mandate_status: "paused",
      }),
    );
    expect(r.allowed).toBe(true);
  });

  it("denies agent claim when mandate_status missing", () => {
    const r = evaluateTransition(
      baseInput({
        kind: "task",
        status: "approved",
        verb: "ticket_claim",
        actor: agent,
        mandate_status: undefined,
        mandate_id: MANDATE_UUID,
        counters: { open_epics: 0, open_tasks: 0, creations_today: 0, writes_today: 0 },
      }),
    );
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.error.code).toBe("MANDATE_NOT_ACTIVE");
      expect(r.error.details?.reason).toBe("mandate_status_missing");
    }
  });
});

describe("ownership OUTSIDE_MANDATE", () => {
  it("denies agent claim when mandate_id missing", () => {
    const r = evaluateTransition(
      baseInput({
        kind: "task",
        status: "approved",
        verb: "ticket_claim",
        actor: agent,
        mandate_id: undefined,
        counters: { open_epics: 0, open_tasks: 0, creations_today: 0, writes_today: 0 },
      }),
    );
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.error.code).toBe("OUTSIDE_MANDATE");
      expect(r.error.details?.reason).toBe("mandate_id_missing");
    }
  });

  it("denies agent claim outside mandate_ids", () => {
    const r = evaluateTransition(
      baseInput({
        kind: "task",
        status: "approved",
        verb: "ticket_claim",
        actor: { type: "agent", mandate_ids: ["other-mandate"] },
        mandate_id: MANDATE_UUID,
        counters: { open_epics: 0, open_tasks: 0, creations_today: 0, writes_today: 0 },
      }),
    );
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.error.code).toBe("OUTSIDE_MANDATE");
    }
  });
});

describe("parent rules INVALID_PARENT", () => {
  it("rejects epic under draft mandate", () => {
    const r = validateParentForCreate("epic", {
      kind: "mandate",
      status: "draft",
      mandate_id: MANDATE_UUID,
    });
    expect(r?.allowed).toBe(false);
    if (r && !r.allowed) {
      expect(r.error.code).toBe("INVALID_PARENT");
    }
  });

  it("rejects task under proposed epic", () => {
    const r = validateParentForCreate("task", {
      kind: "epic",
      status: "proposed",
      mandate_id: MANDATE_UUID,
    });
    expect(r?.allowed).toBe(false);
  });
});

describe("epic authority", () => {
  it("requires human to cancel approved epic", () => {
    const r = evaluateTransition(
      baseInput({
        kind: "epic",
        status: "approved",
        verb: "ticket_cancel",
        actor: agent,
        mandate_id: MANDATE_UUID,
      }),
    );
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.error.code).toBe("HUMAN_ACTOR_REQUIRED");
    }
  });

  it("denies epic complete with open children", () => {
    const r = evaluateTransition(
      baseInput({
        kind: "epic",
        status: "active",
        verb: "ticket_complete",
        actor: agent,
        open_children_count: 2,
        mandate_id: MANDATE_UUID,
      }),
    );
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.error.code).toBe("INVALID_TRANSITION");
    }
  });
});

describe("initialStatusOnCreate", () => {
  it("mandate: human → draft", () => {
    const r = initialStatusOnCreate({
      kind: "mandate",
      actor: human,
      charter: emptyCharter(),
    });
    expect(r).toEqual({ ok: true, status: "draft", mandate_id: null });
  });

  it("mandate: agent denied", () => {
    const r = initialStatusOnCreate({
      kind: "mandate",
      actor: agent,
      charter: emptyCharter(),
    });
    expect(r.ok).toBe(false);
  });

  it("epic: agent → proposed by default", () => {
    const r = initialStatusOnCreate({
      kind: "epic",
      actor: agent,
      parent: activeMandateParent,
      charter: emptyCharter(),
      risk_tier: "L0",
    });
    expect(r).toEqual({ ok: true, status: "proposed", mandate_id: MANDATE_UUID });
  });

  it("epic: agent auto_within_tier → approved", () => {
    const r = initialStatusOnCreate({
      kind: "epic",
      actor: agent,
      parent: activeMandateParent,
      charter: emptyCharter({
        approval_policy: { epics: "auto_within_tier", tasks: "auto" },
        guardrails: {
          allowed_action_categories: ["L0"],
          forbidden_action_categories: [],
          max_auto_risk_tier: "L1",
        },
      }),
      risk_tier: "L0",
    });
    expect(r).toEqual({ ok: true, status: "approved", mandate_id: MANDATE_UUID });
  });

  it("task: agent auto → approved within tier", () => {
    const r = initialStatusOnCreate({
      kind: "task",
      actor: agent,
      parent: approvedEpicParent,
      charter: emptyCharter(),
      risk_tier: "L0",
    });
    expect(r).toEqual({ ok: true, status: "approved", mandate_id: MANDATE_UUID });
  });

  it("task above tier: human → approved", () => {
    const r = initialStatusOnCreate({
      kind: "task",
      actor: human,
      parent: approvedEpicParent,
      charter: emptyCharter({
        guardrails: {
          allowed_action_categories: ["L0"],
          forbidden_action_categories: [],
          max_auto_risk_tier: "L0",
        },
      }),
      risk_tier: "L2",
    });
    expect(r).toEqual({ ok: true, status: "approved", mandate_id: MANDATE_UUID });
  });

  it("task above tier must be decision proposed", () => {
    const r = initialStatusOnCreate({
      kind: "task",
      actor: agent,
      parent: approvedEpicParent,
      charter: emptyCharter({ guardrails: { allowed_action_categories: ["L0"], forbidden_action_categories: [], max_auto_risk_tier: "L0" } }),
      risk_tier: "L2",
    });
    expect(r.ok).toBe(false);
    const decision = initialStatusOnCreate({
      kind: "decision",
      actor: agent,
      parent: approvedEpicParent,
      charter: emptyCharter({ guardrails: { allowed_action_categories: ["L0"], forbidden_action_categories: [], max_auto_risk_tier: "L0" } }),
      risk_tier: "L2",
    });
    expect(decision).toEqual({ ok: true, status: "proposed", mandate_id: MANDATE_UUID });
  });
});

type ExpectedCell =
  | { allowed: true; to_status?: string }
  | { allowed: false; code: string };

function expectedFor(
  kind: TicketKind,
  status: string,
  verb: TicketVerb,
  actorType: "human" | "agent",
): ExpectedCell {
  const invalid = { allowed: false as const, code: "INVALID_TRANSITION" };
  const humanRequired = {
    allowed: false as const,
    code: "HUMAN_ACTOR_REQUIRED",
  };

  if (verb === "ticket_list" || verb === "ticket_get") {
    return { allowed: true };
  }
  if (verb === "ticket_comment") {
    return { allowed: true };
  }
  if (verb === "ticket_request_decision") {
    if (kind === "mandate" && status === "retired") {
      return invalid;
    }
    if (kind === "epic" && (status === "done" || status === "cancelled")) {
      return invalid;
    }
    return { allowed: true };
  }
  if (verb === "ticket_create") {
    if (kind === "mandate") {
      return { allowed: true };
    }
    return { allowed: false, code: "INVALID_PARENT" };
  }

  if (kind === "mandate") {
    if (verb === "ticket_approve" && status === "draft") {
      return actorType === "human"
        ? { allowed: true, to_status: "active" }
        : humanRequired;
    }
    if (verb === "ticket_progress" && status === "active") {
      return { allowed: true, to_status: "paused" };
    }
    if (verb === "ticket_progress" && status === "paused") {
      return { allowed: true, to_status: "active" };
    }
    if (verb === "ticket_cancel" && (status === "active" || status === "paused")) {
      return actorType === "human"
        ? { allowed: true, to_status: "retired" }
        : humanRequired;
    }
    return invalid;
  }

  if (kind === "epic") {
    if (verb === "ticket_approve" && status === "proposed") {
      return actorType === "human"
        ? { allowed: true, to_status: "approved" }
        : humanRequired;
    }
    if (verb === "ticket_progress" && status === "approved") {
      return { allowed: true, to_status: "active" };
    }
    if (verb === "ticket_complete" && status === "active") {
      return { allowed: true, to_status: "done" };
    }
    if (verb === "ticket_cancel" && status === "proposed") {
      return actorType === "human"
        ? { allowed: true, to_status: "cancelled" }
        : humanRequired;
    }
    if (verb === "ticket_cancel" && (status === "approved" || status === "active")) {
      return actorType === "human"
        ? { allowed: true, to_status: "cancelled" }
        : humanRequired;
    }
    return invalid;
  }

  // task / decision share work machine
  if (verb === "ticket_approve" && status === "proposed") {
    return actorType === "human"
      ? { allowed: true, to_status: "approved" }
      : humanRequired;
  }
  if (verb === "ticket_claim" && status === "approved") {
    return { allowed: true, to_status: "claimed" };
  }
  if (verb === "ticket_extend" && ["approved", "claimed", "in_progress", "in_review"].includes(status)) {
    return { allowed: true, to_status: status };
  }
  if (verb === "ticket_progress" && status === "claimed") {
    return { allowed: true, to_status: "in_progress" };
  }
  if (verb === "ticket_progress" && status === "in_progress") {
    return { allowed: true, to_status: "in_review" };
  }
  if (verb === "ticket_complete" && status === "in_review") {
    return { allowed: true, to_status: "done" };
  }
  if (verb === "ticket_block" && !["done", "cancelled", "proposed"].includes(status)) {
    return { allowed: true, to_status: "blocked" };
  }
  if (verb === "ticket_cancel" && status === "proposed") {
    return actorType === "human"
      ? { allowed: true, to_status: "cancelled" }
      : humanRequired;
  }
  if (
    verb === "ticket_cancel" &&
    ["approved", "claimed", "in_progress", "in_review", "waiting_human", "blocked"].includes(
      status,
    )
  ) {
    return { allowed: true, to_status: "cancelled" };
  }
  return invalid;
}

describe("exhaustive kind × status × verb table (agent actor)", () => {
  const kinds: TicketKind[] = ["mandate", "epic", "task", "decision"];

  for (const kind of kinds) {
    for (const status of statusesForKind(kind)) {
      for (const verb of ALL_VERBS) {
        it(`${kind} / ${status} / ${verb}`, () => {
          const expected = expectedFor(kind, status, verb, "agent");
          const result = evaluateTransition(
            baseInput({ kind, status, verb, actor: agent }),
          );

          if (expected.allowed) {
            expect(result.allowed).toBe(true);
            if (expected.to_status !== undefined && result.allowed) {
              expect(result.to_status).toBe(expected.to_status);
            }
          } else {
            expect(result.allowed).toBe(false);
            if (!result.allowed) {
              expect(result.error.code).toBe(expected.code);
            }
          }
        });
      }
    }
  }
});
