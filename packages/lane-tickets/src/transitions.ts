import type {
  Actor,
  EpicStatus,
  MandateCharter,
  MandateCounters,
  MandateStatus,
  SoftBreachHint,
  TicketKind,
  TicketStatus,
  TicketVerb,
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

function isHuman(actor: Actor): boolean {
  return actor.type === "human";
}

function deny(
  code: "GIT_READ_ONLY" | "INVALID_TRANSITION" | "HUMAN_ACTOR_REQUIRED" | "HARD_LIMIT_EXCEEDED",
  message: string,
  details?: Record<string, unknown>,
): TransitionResult {
  return { allowed: false, error: { code, message, details } };
}

function allow(
  to_status?: TicketStatus,
  record_soft_breach?: SoftBreachHint[],
): TransitionResult {
  return { allowed: true, to_status, record_soft_breach };
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
      if (status === "approved") {
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

  if (READ_VERBS.has(verb)) {
    const soft = collectSoftBreaches(charter, input.soft_observations);
    return allow(undefined, soft);
  }

  if (verb === "ticket_comment") {
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
    const soft = collectSoftBreaches(charter, input.soft_observations);
    return allow(undefined, soft);
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
    lifecycle = evaluateEpic(status as EpicStatus, verb, actor);
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
