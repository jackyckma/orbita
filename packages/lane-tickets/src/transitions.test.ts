import { describe, expect, it } from "vitest";
import {
  ALL_VERBS,
  evaluateTransition,
  statusesForKind,
} from "./transitions.js";
import type {
  MandateCharter,
  TicketKind,
  TicketVerb,
  TransitionInput,
} from "./types.js";

function emptyCharter(overrides?: Partial<MandateCharter>): MandateCharter {
  return {
    purpose: "test",
    principles: ["p"],
    guardrails: {
      allowed_action_categories: ["L0"],
      forbidden_action_categories: [],
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
  return {
    actor: { type: "agent" },
    source: "native",
    charter: emptyCharter(),
    ...partial,
  };
}

const human = { type: "human" as const };
const agent = { type: "agent" as const };

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
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.error.code).toBe("HARD_LIMIT_EXCEEDED");
    }
  });
});

describe("evaluateTransition — soft_breach hints", () => {
  it("never blocks on soft constraint breach", () => {
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
      verb: "ticket_comment",
      actor: agent,
      source: "native",
      charter,
      soft_observations: { effort: 25 },
    });
    expect(r.allowed).toBe(true);
    if (r.allowed) {
      expect(r.record_soft_breach?.[0]?.event_kind).toBe("soft_breach");
      expect(r.record_soft_breach?.[0]?.threshold_kind).toBe("block");
    }
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
    return { allowed: true };
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
    if (verb === "ticket_cancel" && status === "approved") {
      return { allowed: true, to_status: "cancelled" };
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
