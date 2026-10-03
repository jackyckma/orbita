import type {
  Actor,
  EpicStatus,
  InitialStatusInput,
  InitialStatusResult,
  MandateCharter,
  MandateCounters,
  MandateStatus,
  ParentTicketRef,
  RiskTier,
  SoftBreachHint,
  TicketKind,
  TicketStatus,
  TicketVerb,
  TransitionErrorCode,
  TransitionInput,
  TransitionResult,
  WorkStatus,
} from "./types.js";

const GIT_READ_ONLY_MESSAGE =
  "Tickets with source=git are read-only in Orbita; mutate the git file instead.";

const READ_VERBS: ReadonlySet<TicketVerb> = new Set([
  "ticket_list",
  "ticket_get",
]);

const APPEND_VERBS: ReadonlySet<TicketVerb> = new Set([
  "ticket_comment",
  "ticket_request_decision",
]);

const MUTATING_VERBS: ReadonlySet<TicketVerb> = new Set([
  "ticket_approve",
  "ticket_claim",
  "ticket_extend",
  "ticket_progress",
  "ticket_complete",
  "ticket_block",
  "ticket_cancel",
  "ticket_create",
]);

const KILL_SWITCH_EXEMPT: ReadonlySet<TicketVerb> = new Set([
  "ticket_comment",
  "ticket_block",
  "ticket_request_decision",
]);

const OWNERSHIP_VERBS: ReadonlySet<TicketVerb> = new Set([
  "ticket_claim",
  "ticket_progress",
  "ticket_complete",
  "ticket_block",
  "ticket_cancel",
  "ticket_extend",
  "ticket_comment",
  "ticket_approve",
]);

const RISK_TIER_ORDER: Record<RiskTier, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  money: 3,
};

function isHuman(actor: Actor): boolean {
  return actor.type === "human";
}

function isAgent(actor: Actor): boolean {
  return actor.type === "agent";
}

function riskWithinAutoTier(
  risk: RiskTier | undefined,
  max: RiskTier | undefined,
): boolean {
  if (!risk || !max) {
    return false;
  }
  return RISK_TIER_ORDER[risk] <= RISK_TIER_ORDER[max];
}

function defaultApprovalPolicy(charter: MandateCharter) {
  return {
    epics: charter.approval_policy?.epics ?? "integrator",
    tasks: charter.approval_policy?.tasks ?? "auto",
  };
}

function deny(
  code: TransitionErrorCode,
  message: string,
  details?: Record<string, unknown>,
  record_soft_breach?: SoftBreachHint[],
): TransitionResult {
  const result: TransitionResult = {
    allowed: false,
    error: { code, message, details },
  };
  if (record_soft_breach?.length) {
    (result as { record_soft_breach?: SoftBreachHint[] }).record_soft_breach =
      record_soft_breach;
  }
  return result;
}

function allow(
  to_status?: TicketStatus,
  record_soft_breach?: SoftBreachHint[],
): TransitionResult {
  return { allowed: true, to_status, record_soft_breach };
}

function isTerminalParent(kind: TicketKind, status: TicketStatus): boolean {
  if (kind === "mandate") {
    return status === "retired";
  }
  if (kind === "epic") {
    return status === "done" || status === "cancelled";
  }
  return status === "done" || status === "cancelled";
}

/** Pure parent rules for ticket_create (and initial status). */
export function validateParentForCreate(
  createKind: TicketKind,
  parent: ParentTicketRef | null | undefined,
): TransitionResult | null {
  if (createKind === "mandate") {
    if (parent) {
      return deny(
        "INVALID_PARENT",
        "Mandate tickets must not have a parent.",
      );
    }
    return null;
  }
  if (!parent) {
    return deny("INVALID_PARENT", `${createKind} requires a parent ticket.`);
  }
  if (createKind === "epic") {
    if (parent.kind !== "mandate" || parent.status !== "active") {
      return deny(
        "INVALID_PARENT",
        "Epic parent must be an active mandate.",
        { parent_kind: parent.kind, parent_status: parent.status },
      );
    }
    return null;
  }
  if (createKind === "task") {
    if (
      parent.kind !== "epic" ||
      (parent.status !== "approved" && parent.status !== "active")
    ) {
      return deny(
        "INVALID_PARENT",
        "Task parent must be an epic in approved or active status.",
        { parent_kind: parent.kind, parent_status: parent.status },
      );
    }
    return null;
  }
  if (createKind === "decision") {
    if (isTerminalParent(parent.kind, parent.status)) {
      return deny(
        "INVALID_PARENT",
        "Decision parent must be a non-terminal ticket.",
        { parent_kind: parent.kind, parent_status: parent.status },
      );
    }
    return null;
  }
  return null;
}

function resolveMandateIdForCreate(
  createKind: TicketKind,
  parent: ParentTicketRef | null | undefined,
): string | null {
  if (createKind === "mandate") {
    return null;
  }
  return parent?.mandate_id ?? null;
}

function checkAgentMandateOwnership(
  actor: Actor,
  mandateId: string | null | undefined,
): TransitionResult | null {
  if (!isAgent(actor)) {
    return null;
  }
  if (mandateId === undefined) {
    return null;
  }
  if (!mandateId) {
    return deny(
      "OUTSIDE_MANDATE",
      "Agent actor requires mandate_id for ownership check.",
    );
  }
  const ids = actor.mandate_ids ?? [];
  if (!ids.includes(mandateId)) {
    return deny(
      "OUTSIDE_MANDATE",
      "Agent is not authorized for this mandate subtree.",
      { mandate_id: mandateId },
    );
  }
  return null;
}

function checkMandateKillSwitch(
  input: TransitionInput,
): TransitionResult | null {
  const { mandate_status, verb, actor, kind } = input;
  if (!isAgent(actor) || kind === "mandate") {
    return null;
  }
  if (!mandate_status || mandate_status === "active") {
    return null;
  }
  if (READ_VERBS.has(verb) || KILL_SWITCH_EXEMPT.has(verb)) {
    return null;
  }
  if (MUTATING_VERBS.has(verb) || APPEND_VERBS.has(verb)) {
    if (KILL_SWITCH_EXEMPT.has(verb)) {
      return null;
    }
    return deny(
      "MANDATE_NOT_ACTIVE",
      `Mutations are blocked while mandate is ${mandate_status}.`,
      { mandate_status },
    );
  }
  return null;
}

function charterRequiresServerCounters(charter: MandateCharter): boolean {
  return charter.hard_limits.some((l) => l.enforcement === "server");
}

function collectSoftBreaches(
  charter: MandateCharter,
  observations: Record<string, number> | undefined,
): SoftBreachHint[] | undefined {
  if (!observations || charter.soft_constraints.length === 0) {
    return undefined;
  }
  const hints: SoftBreachHint[] = [];
  for (const constraint of charter.soft_constraints) {
    const observed = observations[constraint.id];
    if (observed === undefined) {
      continue;
    }
    let threshold_kind: "warn" | "block" | undefined;
    if (
      constraint.block_threshold !== undefined &&
      observed >= constraint.block_threshold
    ) {
      threshold_kind = "block";
    } else if (
      constraint.warn_threshold !== undefined &&
      observed >= constraint.warn_threshold
    ) {
      threshold_kind = "warn";
    }
    if (!threshold_kind) {
      continue;
    }
    hints.push({
      event_kind: "soft_breach",
      constraint_id: constraint.id,
      metric: constraint.metric,
      observed_value: observed,
      threshold_kind,
      target_value: constraint.target_value,
    });
  }
  return hints.length > 0 ? hints : undefined;
}

function checkSoftBlock(
  charter: MandateCharter,
  observations: Record<string, number> | undefined,
): TransitionResult | null {
  const hints = collectSoftBreaches(charter, observations);
  if (!hints?.some((h) => h.threshold_kind === "block")) {
    return null;
  }
  const blockHints = hints.filter((h) => h.threshold_kind === "block");
  return deny(
    "SOFT_BLOCK_THRESHOLD_EXCEEDED",
    "Soft constraint block_threshold exceeded.",
    { constraints: blockHints.map((h) => h.constraint_id) },
    blockHints,
  );
}

function checkServerHardLimits(
  charter: MandateCharter,
  counters: MandateCounters | undefined,
  create_kind: TicketKind | undefined,
  verb: TicketVerb,
): TransitionResult | null {
  if (!counters) {
    return null;
  }
  for (const limit of charter.hard_limits) {
    if (limit.enforcement !== "server") {
      continue;
    }
    if (verb === "ticket_create" && create_kind) {
      if (
        create_kind === "epic" &&
        limit.max_open_epics !== undefined &&
        counters.open_epics >= limit.max_open_epics
      ) {
        return deny(
          "HARD_LIMIT_EXCEEDED",
          `Hard limit ${limit.id}: max_open_epics (${limit.max_open_epics}) reached.`,
          { limit_id: limit.id, max_open_epics: limit.max_open_epics },
        );
      }
      if (
        (create_kind === "task" || create_kind === "decision") &&
        limit.max_open_tasks !== undefined &&
        counters.open_tasks >= limit.max_open_tasks
      ) {
        return deny(
          "HARD_LIMIT_EXCEEDED",
          `Hard limit ${limit.id}: max_open_tasks (${limit.max_open_tasks}) reached.`,
          { limit_id: limit.id, max_open_tasks: limit.max_open_tasks },
        );
      }
      if (
        limit.max_creations_per_day !== undefined &&
        counters.creations_today >= limit.max_creations_per_day
      ) {
        return deny(
          "HARD_LIMIT_EXCEEDED",
          `Hard limit ${limit.id}: max_creations_per_day (${limit.max_creations_per_day}) reached.`,
          {
            limit_id: limit.id,
            max_creations_per_day: limit.max_creations_per_day,
          },
        );
      }
    }
    if (
      MUTATING_VERBS.has(verb) &&
      verb !== "ticket_create" &&
      limit.max_writes_per_day !== undefined &&
      counters.writes_today >= limit.max_writes_per_day
    ) {
      return deny(
        "HARD_LIMIT_EXCEEDED",
        `Hard limit ${limit.id}: max_writes_per_day (${limit.max_writes_per_day}) reached.`,
        { limit_id: limit.id, max_writes_per_day: limit.max_writes_per_day },
      );
    }
  }
  return null;
}

function evaluateMandate(
  status: MandateStatus,
  verb: TicketVerb,
  actor: Actor,
  progress_target?: TicketStatus,
): TransitionResult {
  switch (verb) {
    case "ticket_approve":
      if (status !== "draft") {
        return deny("INVALID_TRANSITION", "Mandate approve only from draft.");
      }
      if (!isHuman(actor)) {
        return deny(
          "HUMAN_ACTOR_REQUIRED",
          "Activating a mandate requires a human actor.",
        );
      }
      return allow("active");
    case "ticket_progress":
      if (
        (status === "active" || status === "paused") &&
        progress_target === "retired"
      ) {
        if (!isHuman(actor)) {
          return deny(
            "HUMAN_ACTOR_REQUIRED",
            "Retiring a mandate requires a human actor.",
          );
        }
        return allow("retired");
      }
      if (status === "active") {
        return allow("paused");
      }
      if (status === "paused") {
        return allow("active");
      }
      return deny("INVALID_TRANSITION", `Cannot progress mandate from ${status}.`);
    case "ticket_cancel":
      if (status === "active" || status === "paused") {
        if (!isHuman(actor)) {
          return deny(
            "HUMAN_ACTOR_REQUIRED",
            "Retiring a mandate requires a human actor.",
          );
        }
        return allow("retired");
      }
      return deny("INVALID_TRANSITION", `Cannot cancel mandate from ${status}.`);
    default:
      return deny(
        "INVALID_TRANSITION",
        `Verb ${verb} does not apply to mandate lifecycle.`,
      );
  }
}

function evaluateEpic(
  status: EpicStatus,
  verb: TicketVerb,
  actor: Actor,
  open_children_count?: number,
): TransitionResult {
  switch (verb) {
    case "ticket_approve":
      if (status !== "proposed") {
        return deny("INVALID_TRANSITION", "Epic approve only from proposed.");
      }
      if (!isHuman(actor)) {
        return deny(
          "HUMAN_ACTOR_REQUIRED",
          "Approving an epic requires a human actor.",
        );
      }
      return allow("approved");
    case "ticket_progress":
      if (status !== "approved") {
        return deny("INVALID_TRANSITION", "Epic progress only from approved.");
      }
      return allow("active");
    case "ticket_complete":
      if (status !== "active") {
        return deny("INVALID_TRANSITION", "Epic complete only from active.");
      }
      if (isAgent(actor) && (open_children_count ?? 0) > 0) {
        return deny(
          "INVALID_TRANSITION",
          "Epic cannot complete while open children remain.",
          { open_children_count },
        );
      }
      return allow("done");
    case "ticket_cancel":
      if (status === "proposed") {
        if (!isHuman(actor)) {
          return deny(
            "HUMAN_ACTOR_REQUIRED",
            "Cancelling a proposed epic requires a human actor.",
          );
        }
        return allow("cancelled");
      }
      if (status === "approved" || status === "active") {
        if (!isHuman(actor)) {
          return deny(
            "HUMAN_ACTOR_REQUIRED",
            "Cancelling an approved or active epic requires a human actor.",
          );
        }
        return allow("cancelled");
      }
      return deny("INVALID_TRANSITION", `Cannot cancel epic from ${status}.`);
    default:
      return deny(
        "INVALID_TRANSITION",
        `Verb ${verb} does not apply to epic lifecycle.`,
      );
  }
}

function evaluateWork(
  status: WorkStatus,
  verb: TicketVerb,
  actor: Actor,
  progress_target?: TicketStatus,
): TransitionResult {
  switch (verb) {
    case "ticket_approve":
      if (status !== "proposed") {
        return deny("INVALID_TRANSITION", "Work approve only from proposed.");
      }
      if (!isHuman(actor)) {
        return deny(
          "HUMAN_ACTOR_REQUIRED",
          "Approving work requires a human actor.",
        );
      }
      return allow("approved");
    case "ticket_claim":
      if (status !== "approved") {
        return deny("INVALID_TRANSITION", "Claim only from approved.");
      }
      return allow("claimed");
    case "ticket_extend":
      if (
        status === "approved" ||
        status === "claimed" ||
        status === "in_progress" ||
        status === "in_review"
      ) {
        return allow(status);
      }
      return deny("INVALID_TRANSITION", `Cannot extend lease from ${status}.`);
    case "ticket_progress":
      if (status === "claimed") {
        return allow("in_progress");
      }
      if (status === "in_progress") {
        return allow("in_review");
      }
      if (status === "blocked" && progress_target === "in_progress") {
        return allow("in_progress");
      }
      if (status === "waiting_human" && progress_target === "in_progress") {
        return allow("in_progress");
      }
      return deny("INVALID_TRANSITION", `Cannot progress work from ${status}.`);
    case "ticket_complete":
      if (status !== "in_review") {
        return deny("INVALID_TRANSITION", "Complete only from in_review.");
      }
      return allow("done");
    case "ticket_block":
      if (
        status === "done" ||
        status === "cancelled" ||
        status === "proposed"
      ) {
        return deny("INVALID_TRANSITION", `Cannot block from ${status}.`);
      }
      return allow("blocked");
    case "ticket_cancel":
      if (status === "proposed") {
        if (!isHuman(actor)) {
          return deny(
            "HUMAN_ACTOR_REQUIRED",
            "Cancelling proposed work requires a human actor.",
          );
        }
        return allow("cancelled");
      }
      if (
        status === "approved" ||
        status === "claimed" ||
        status === "in_progress" ||
        status === "in_review" ||
        status === "waiting_human" ||
        status === "blocked"
      ) {
        return allow("cancelled");
      }
      return deny("INVALID_TRANSITION", `Cannot cancel work from ${status}.`);
    default:
      return deny(
        "INVALID_TRANSITION",
        `Verb ${verb} does not apply to work lifecycle.`,
      );
  }
}

/**
 * Pure helper: initial status when creating a ticket (no persistence).
 */
export function initialStatusOnCreate(
  input: InitialStatusInput,
): InitialStatusResult {
  const { kind, actor, parent, charter, risk_tier } = input;
  const parentCheck = validateParentForCreate(kind, parent);
  if (parentCheck && !parentCheck.allowed) {
    return {
      ok: false,
      error: parentCheck.error,
    };
  }

  const mandateId = resolveMandateIdForCreate(kind, parent);
  if (kind !== "mandate") {
    const ownership = checkAgentMandateOwnership(actor, mandateId);
    if (ownership && !ownership.allowed) {
      return { ok: false, error: ownership.error };
    }
  }

  const maxAuto = charter.guardrails.max_auto_risk_tier;
  const policy = defaultApprovalPolicy(charter);

  if (kind === "mandate") {
    if (!isHuman(actor)) {
      return {
        ok: false,
        error: {
          code: "HUMAN_ACTOR_REQUIRED",
          message: "Only a human actor may create a mandate.",
        },
      };
    }
    return { ok: true, status: "draft", mandate_id: null };
  }

  if (kind === "epic") {
    if (isHuman(actor)) {
      return { ok: true, status: "approved", mandate_id: mandateId };
    }
    if (
      isAgent(actor) &&
      policy.epics === "auto_within_tier" &&
      riskWithinAutoTier(risk_tier, maxAuto)
    ) {
      return { ok: true, status: "approved", mandate_id: mandateId };
    }
    return { ok: true, status: "proposed", mandate_id: mandateId };
  }

  if (kind === "task" || kind === "decision") {
    if (!riskWithinAutoTier(risk_tier, maxAuto)) {
      if (kind !== "decision") {
        return {
          ok: false,
          error: {
            code: "INVALID_TRANSITION",
            message:
              "Risk tier above auto-approve ceiling; create a decision ticket instead.",
            details: { risk_tier, max_auto_risk_tier: maxAuto },
          },
        };
      }
      return { ok: true, status: "proposed", mandate_id: mandateId };
    }
    if (
      isAgent(actor) &&
      policy.tasks === "auto" &&
      riskWithinAutoTier(risk_tier, maxAuto)
    ) {
      return { ok: true, status: "approved", mandate_id: mandateId };
    }
    if (isHuman(actor)) {
      return { ok: true, status: "approved", mandate_id: mandateId };
    }
    return { ok: true, status: "proposed", mandate_id: mandateId };
  }

  return {
    ok: false,
    error: {
      code: "INVALID_TRANSITION",
      message: `Unsupported create kind ${kind}.`,
    },
  };
}

/**
 * Pure transition engine: allow/deny with stable error codes and optional soft_breach hints.
 */
export function evaluateTransition(input: TransitionInput): TransitionResult {
  const { kind, status, verb, actor, source, git_ref, charter } = input;

  if (source === "git") {
    if (MUTATING_VERBS.has(verb) || APPEND_VERBS.has(verb)) {
      return deny("GIT_READ_ONLY", GIT_READ_ONLY_MESSAGE, {
        git_ref: git_ref ?? "unknown",
        message: GIT_READ_ONLY_MESSAGE,
      });
    }
  }

  const kill = checkMandateKillSwitch(input);
  if (kill) {
    return kill;
  }

  if (verb === "ticket_create") {
    const createKind = input.create_kind ?? kind;
    const parentCheck = validateParentForCreate(createKind, input.parent);
    if (parentCheck) {
      return parentCheck;
    }
    if (createKind !== "mandate") {
      const mandateForCreate = resolveMandateIdForCreate(createKind, input.parent);
      const ownCreate = checkAgentMandateOwnership(actor, mandateForCreate);
      if (ownCreate) {
        return ownCreate;
      }
    }
  } else if (OWNERSHIP_VERBS.has(verb)) {
    const own = checkAgentMandateOwnership(actor, input.mandate_id);
    if (own) {
      return own;
    }
  }

  if (READ_VERBS.has(verb)) {
    const softBlock = checkSoftBlock(charter, input.soft_observations);
    if (softBlock) {
      return softBlock;
    }
    const soft = collectSoftBreaches(charter, input.soft_observations);
    return allow(undefined, soft);
  }

  if (verb === "ticket_comment") {
    const softBlock = checkSoftBlock(charter, input.soft_observations);
    if (softBlock) {
      return softBlock;
    }
    const soft = collectSoftBreaches(charter, input.soft_observations);
    return allow(undefined, soft);
  }

  if (verb === "ticket_request_decision") {
    if (kind === "mandate" && status === "retired") {
      return deny("INVALID_TRANSITION", "Cannot request decision on retired mandate.");
    }
    if (kind === "epic" && (status === "done" || status === "cancelled")) {
      return deny("INVALID_TRANSITION", "Cannot request decision on terminal epic.");
    }
    const softBlock = checkSoftBlock(charter, input.soft_observations);
    if (softBlock) {
      return softBlock;
    }
    const soft = collectSoftBreaches(charter, input.soft_observations);
    return allow(undefined, soft);
  }

  if (
    charterRequiresServerCounters(charter) &&
    !input.counters &&
    (MUTATING_VERBS.has(verb) || verb === "ticket_create")
  ) {
    return deny(
      "HARD_LIMIT_COUNTERS_MISSING",
      "Server hard limits require mandate counters; none were supplied.",
    );
  }

  const hard = checkServerHardLimits(
    charter,
    input.counters,
    input.create_kind ?? (verb === "ticket_create" ? kind : undefined),
    verb,
  );
  if (hard) {
    return hard;
  }

  const softBlockMutate = checkSoftBlock(charter, input.soft_observations);
  if (softBlockMutate) {
    return softBlockMutate;
  }

  if (verb === "ticket_create") {
    const soft = collectSoftBreaches(charter, input.soft_observations);
    return allow(undefined, soft);
  }

  let lifecycle: TransitionResult;
  if (kind === "mandate") {
    lifecycle = evaluateMandate(
      status as MandateStatus,
      verb,
      actor,
      input.progress_target,
    );
  } else if (kind === "epic") {
    lifecycle = evaluateEpic(
      status as EpicStatus,
      verb,
      actor,
      input.open_children_count,
    );
  } else {
    lifecycle = evaluateWork(
      status as WorkStatus,
      verb,
      actor,
      input.progress_target,
    );
  }

  if (!lifecycle.allowed) {
    return lifecycle;
  }

  const soft = collectSoftBreaches(charter, input.soft_observations);
  if (soft) {
    return { ...lifecycle, record_soft_breach: soft };
  }
  return lifecycle;
}

/** Exported for exhaustive table tests. */
export const MANDATE_STATUSES: MandateStatus[] = [
  "draft",
  "active",
  "paused",
  "retired",
];

export const EPIC_STATUSES: EpicStatus[] = [
  "proposed",
  "approved",
  "active",
  "done",
  "cancelled",
];

export const WORK_STATUSES: WorkStatus[] = [
  "proposed",
  "approved",
  "claimed",
  "in_progress",
  "in_review",
  "done",
  "waiting_human",
  "blocked",
  "cancelled",
];

export const ALL_VERBS: TicketVerb[] = [
  "ticket_create",
  "ticket_list",
  "ticket_get",
  "ticket_approve",
  "ticket_claim",
  "ticket_extend",
  "ticket_progress",
  "ticket_complete",
  "ticket_block",
  "ticket_request_decision",
  "ticket_comment",
  "ticket_cancel",
];

export function statusesForKind(kind: TicketKind): TicketStatus[] {
  if (kind === "mandate") {
    return MANDATE_STATUSES;
  }
  if (kind === "epic") {
    return EPIC_STATUSES;
  }
  return WORK_STATUSES;
}
