import {
  canActivateMandate,
  canApproveEpicOrWork,
  canCancelApprovedEpic,
  canCreateMandate,
  canManageMandateLifecycle,
  canResolveDecision,
  canUpdateCharter,
  isExecutor,
  isFounder,
  isFounderOrIntegrator,
  isIntegrator,
} from "./roles.js";
import { applyCharterPatch, type CharterPatch } from "./charter-update.js";
import { riskWithinAutoTier } from "./risk-tier.js";
import {
  exceptionTypeAllowsRisk,
  findExceptionTypeDef,
  normalizeTaskClass,
  shouldRequireReviewOnCreate,
  validateExceptionTaskParent,
} from "./exception-tasks.js";
import type {
  Actor,
  EpicStatus,
  InitialStatusInput,
  InitialStatusResult,
  MandateCharter,
  MandateCounters,
  MandateStatus,
  ParentTicketRef,
  ReviewOutcome,
  RiskTier,
  SoftBreachHint,
  TaskClass,
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
  "ticket_update_charter",
  "ticket_review",
]);

const PAUSE_GATE_EXEMPT: ReadonlySet<TicketVerb> = new Set([
  "ticket_comment",
  "ticket_block",
  "ticket_request_decision",
  "ticket_review",
]);

const PAUSE_GATED_AGENT_MUTATIONS: ReadonlySet<TicketVerb> = new Set([
  "ticket_create",
  "ticket_claim",
  "ticket_progress",
  "ticket_complete",
  "ticket_cancel",
  "ticket_extend",
  "ticket_approve",
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

function privilegedRequired(message: string): TransitionResult {
  return deny("PRIVILEGED_ROLE_REQUIRED", message);
}

const MANDATE_LIFECYCLE_STATUSES: ReadonlySet<TicketStatus> = new Set([
  "active",
  "paused",
  "retired",
]);

const MANDATE_LIFECYCLE_VERBS: ReadonlySet<TicketVerb> = new Set([
  "ticket_approve",
  "ticket_progress",
  "ticket_cancel",
]);

function roleRequired(
  required_roles: Array<"founder" | "integrator">,
  message: string,
): TransitionResult {
  return deny("ROLE_REQUIRED", message, { required_roles });
}

function checkMandateLifecycleRoles(input: TransitionInput): TransitionResult | null {
  const { kind, status, verb, actor, progress_target } = input;
  if (kind !== "mandate" || !MANDATE_LIFECYCLE_VERBS.has(verb)) {
    return null;
  }

  if (verb === "ticket_approve") {
    if (!canActivateMandate(actor)) {
      return roleRequired(["founder"], "Activating a mandate requires a founder.");
    }
    return null;
  }

  if (!canManageMandateLifecycle(actor)) {
    return roleRequired(
      ["founder", "integrator"],
      "Mandate lifecycle changes require founder or integrator.",
    );
  }

  if (verb === "ticket_progress") {
    if (
      progress_target !== undefined &&
      !MANDATE_LIFECYCLE_STATUSES.has(progress_target)
    ) {
      return deny(
        "INVALID_TRANSITION",
        "ticket_progress on a mandate may only target active, paused, or retired.",
        { progress_target },
      );
    }
  }

  return null;
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

export interface ValidateParentOptions {
  task_class?: TaskClass;
  charter?: MandateCharter;
  counters?: MandateCounters;
  exception_type?: string;
}

/** Pure parent rules for ticket_create (and initial status). */
export function validateParentForCreate(
  createKind: TicketKind,
  parent: ParentTicketRef | null | undefined,
  options?: ValidateParentOptions,
): TransitionResult | null {
  const task_class = normalizeTaskClass(createKind, options?.task_class);
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
    if (task_class === "exception") {
      if (!options?.charter) {
        return deny(
          "INVALID_PARENT",
          "Exception task validation requires mandate charter.",
        );
      }
      const exc = validateExceptionTaskParent(
        parent,
        options.charter,
        options.exception_type,
        options.counters,
      );
      if (!exc.ok) {
        return deny(
          exc.code as TransitionErrorCode,
          exc.message,
          exc.details,
        );
      }
      return null;
    }
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

function checkExecutorMandateOwnership(
  actor: Actor,
  mandateId: string | null | undefined,
): TransitionResult | null {
  if (!isExecutor(actor)) {
    return null;
  }
  if (mandateId === undefined) {
    return deny(
      "OUTSIDE_MANDATE",
      "Executor actor requires mandate_id for ownership check.",
      { reason: "mandate_id_missing" },
    );
  }
  if (!mandateId) {
    return deny(
      "OUTSIDE_MANDATE",
      "Executor actor requires mandate_id for ownership check.",
    );
  }
  const ids = actor.mandate_ids ?? [];
  if (!ids.includes(mandateId)) {
    return deny(
      "OUTSIDE_MANDATE",
      "Executor is not authorized for this mandate subtree.",
      { mandate_id: mandateId },
    );
  }
  return null;
}

/** Agent pause gate: inactive or missing ancestor mandate status blocks gated writes. */
function checkMandatePauseGate(
  input: TransitionInput,
): TransitionResult | null {
  const { mandate_status, verb, actor, kind } = input;
  if (!isExecutor(actor) || kind === "mandate") {
    return null;
  }
  if (READ_VERBS.has(verb) || PAUSE_GATE_EXEMPT.has(verb)) {
    return null;
  }
  if (!PAUSE_GATED_AGENT_MUTATIONS.has(verb)) {
    return null;
  }
  if (mandate_status === undefined) {
    return deny(
      "MANDATE_NOT_ACTIVE",
      "Executor mutations require mandate_status from persistence.",
      { reason: "mandate_status_missing", mandate_status },
    );
  }
  if (mandate_status === "active") {
    return null;
  }
  return deny(
    "MANDATE_NOT_ACTIVE",
    `Mutations are blocked while mandate is ${mandate_status}.`,
    { mandate_status },
  );
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
        create_kind === "task" &&
        limit.max_open_exceptions !== undefined &&
        counters.open_exception_tasks >= limit.max_open_exceptions
      ) {
        return deny(
          "HARD_LIMIT_EXCEEDED",
          `Hard limit ${limit.id}: max_open_exceptions (${limit.max_open_exceptions}) reached.`,
          {
            limit_id: limit.id,
            max_open_exceptions: limit.max_open_exceptions,
          },
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
      if (!canActivateMandate(actor)) {
        return roleRequired(["founder"], "Activating a mandate requires a founder.");
      }
      return allow("active");
    case "ticket_progress":
      if (
        (status === "active" || status === "paused") &&
        progress_target === "retired"
      ) {
        if (!canManageMandateLifecycle(actor)) {
          return roleRequired(
            ["founder", "integrator"],
            "Retiring a mandate requires founder or integrator.",
          );
        }
        return allow("retired");
      }
      if (status === "active") {
        if (progress_target !== undefined && progress_target !== "paused") {
          return deny(
            "INVALID_TRANSITION",
            "Active mandate may pause (target paused) or retire (target retired).",
            { progress_target },
          );
        }
        if (!canManageMandateLifecycle(actor)) {
          return roleRequired(
            ["founder", "integrator"],
            "Pausing a mandate requires founder or integrator.",
          );
        }
        return allow("paused");
      }
      if (status === "paused") {
        if (progress_target !== undefined && progress_target !== "active") {
          return deny(
            "INVALID_TRANSITION",
            "Paused mandate may resume (target active) or retire (target retired).",
            { progress_target },
          );
        }
        if (!canManageMandateLifecycle(actor)) {
          return roleRequired(
            ["founder", "integrator"],
            "Resuming a mandate requires founder or integrator.",
          );
        }
        return allow("active");
      }
      return deny("INVALID_TRANSITION", `Cannot progress mandate from ${status}.`);
    case "ticket_cancel":
      if (status === "active" || status === "paused") {
        if (!canManageMandateLifecycle(actor)) {
          return roleRequired(
            ["founder", "integrator"],
            "Retiring a mandate requires founder or integrator.",
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
      if (!canApproveEpicOrWork(actor)) {
        return privilegedRequired(
          "Approving an epic requires founder or integrator.",
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
      if (isExecutor(actor) && (open_children_count ?? 0) > 0) {
        return deny(
          "INVALID_TRANSITION",
          "Epic cannot complete while open children remain.",
          { open_children_count },
        );
      }
      return allow("done");
    case "ticket_cancel":
      if (status === "proposed") {
        if (!canCancelApprovedEpic(actor)) {
          return privilegedRequired(
            "Cancelling a proposed epic requires founder or integrator.",
          );
        }
        return allow("cancelled");
      }
      if (status === "approved" || status === "active") {
        if (!canCancelApprovedEpic(actor)) {
          return privilegedRequired(
            "Cancelling an approved or active epic requires founder or integrator.",
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
  kind: TicketKind,
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
      if (kind === "decision") {
        if (!canResolveDecision(actor)) {
          return privilegedRequired(
            "Resolving a decision requires a founder.",
          );
        }
      } else if (!canApproveEpicOrWork(actor)) {
        return privilegedRequired(
          "Approving work requires founder or integrator.",
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
        if (!canApproveEpicOrWork(actor)) {
          return privilegedRequired(
            "Cancelling proposed work requires founder or integrator.",
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
  const {
    kind,
    actor,
    parent,
    charter,
    risk_tier,
    task_class: taskClassIn,
    exception_type,
    counters,
  } = input;
  const task_class = normalizeTaskClass(kind, taskClassIn);
  const parentCheck = validateParentForCreate(kind, parent, {
    task_class,
    charter,
    counters,
    exception_type,
  });
  if (parentCheck && !parentCheck.allowed) {
    return {
      ok: false,
      error: parentCheck.error,
    };
  }

  const mandateId = resolveMandateIdForCreate(kind, parent);
  if (kind !== "mandate") {
    const ownership = checkExecutorMandateOwnership(actor, mandateId);
    if (ownership && !ownership.allowed) {
      return { ok: false, error: ownership.error };
    }
  }

  const maxAuto = charter.guardrails.max_auto_risk_tier;
  const policy = defaultApprovalPolicy(charter);

  if (kind === "mandate") {
    if (!canCreateMandate(actor)) {
      return {
        ok: false,
        error: {
          code: "PRIVILEGED_ROLE_REQUIRED",
          message: "Only a founder or integrator may create a mandate.",
        },
      };
    }
    return { ok: true, status: "draft", mandate_id: null };
  }

  if (kind === "epic") {
    if (isFounderOrIntegrator(actor)) {
      return { ok: true, status: "proposed", mandate_id: mandateId };
    }
    if (
      isExecutor(actor) &&
      policy.epics === "auto_within_tier" &&
      riskWithinAutoTier(risk_tier, maxAuto)
    ) {
      return {
        ok: true,
        status: "approved",
        mandate_id: mandateId,
        requires_review: shouldRequireReviewOnCreate(
          "epic",
          "planned",
          actor,
          "approved",
        ),
      };
    }
    return { ok: true, status: "proposed", mandate_id: mandateId };
  }

  if (kind === "task" || kind === "decision") {
    if (kind === "task" && task_class === "exception") {
      const def = exception_type
        ? findExceptionTypeDef(charter, exception_type)
        : undefined;
      if (!def) {
        return {
          ok: false,
          error: {
            code: "INVALID_PARENT",
            message: "Exception tasks require a valid exception_type on the charter.",
          },
        };
      }
      if (!exceptionTypeAllowsRisk(def, risk_tier)) {
        return {
          ok: false,
          error: {
            code: "INVALID_TRANSITION",
            message: "Risk tier exceeds exception type risk_tier_max.",
            details: { risk_tier, risk_tier_max: def.risk_tier_max },
          },
        };
      }
      const autoApprove = def.auto_approve !== false;
      const status =
        autoApprove && riskWithinAutoTier(risk_tier, maxAuto)
          ? "approved"
          : "proposed";
      return {
        ok: true,
        status,
        mandate_id: mandateId,
        task_class,
        exception_type,
        requires_review: true,
      };
    }

    if (!riskWithinAutoTier(risk_tier, maxAuto)) {
      if (kind === "task" && isFounderOrIntegrator(actor)) {
        return {
          ok: true,
          status: "approved",
          mandate_id: mandateId,
          task_class,
          requires_review: false,
        };
      }
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
      isExecutor(actor) &&
      policy.tasks === "auto" &&
      riskWithinAutoTier(risk_tier, maxAuto)
    ) {
      return {
        ok: true,
        status: "approved",
        mandate_id: mandateId,
        task_class,
        requires_review: shouldRequireReviewOnCreate(
          kind,
          task_class,
          actor,
          "approved",
        ),
      };
    }
    if (isFounderOrIntegrator(actor)) {
      return {
        ok: true,
        status: "approved",
        mandate_id: mandateId,
        task_class,
        requires_review: false,
      };
    }
    return { ok: true, status: "proposed", mandate_id: mandateId, task_class };
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

  const mandateLifecycleRole = checkMandateLifecycleRoles(input);
  if (mandateLifecycleRole) {
    return mandateLifecycleRole;
  }

  const pauseGate = checkMandatePauseGate(input);
  if (pauseGate) {
    return pauseGate;
  }

  if (verb === "ticket_create") {
    const createKind = input.create_kind ?? kind;
    const parentCheck = validateParentForCreate(createKind, input.parent, {
      task_class: input.task_class,
      charter,
      counters: input.counters,
      exception_type: input.exception_type,
    });
    if (parentCheck) {
      return parentCheck;
    }
    if (createKind !== "mandate") {
      const mandateForCreate = resolveMandateIdForCreate(createKind, input.parent);
      const ownCreate = checkExecutorMandateOwnership(actor, mandateForCreate);
      if (ownCreate) {
        return ownCreate;
      }
    }
  } else if (OWNERSHIP_VERBS.has(verb)) {
    const own = checkExecutorMandateOwnership(actor, input.mandate_id);
    if (own) {
      return own;
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

  if (verb === "ticket_review") {
    if (!isFounderOrIntegrator(actor)) {
      return roleRequired(
        ["founder", "integrator"],
        "Reviewing tickets requires founder or integrator.",
      );
    }
    if (kind !== "epic" && kind !== "task") {
      return deny(
        "INVALID_TRANSITION",
        "ticket_review applies to epics and tasks only.",
      );
    }
    if (!input.requires_review) {
      return deny(
        "INVALID_TRANSITION",
        "Ticket is not in the integrator review queue.",
      );
    }
    if (input.reviewed_at) {
      return deny("INVALID_TRANSITION", "Ticket was already reviewed.");
    }
    const outcome = input.review_outcome;
    const validOutcomes: ReviewOutcome[] = [
      "accepted",
      "needs_changes",
      "cancel",
    ];
    if (!outcome || !validOutcomes.includes(outcome)) {
      return deny(
        "INVALID_TRANSITION",
        "ticket_review requires review_outcome accepted | needs_changes | cancel.",
      );
    }
    if (
      input.creator_api_key_id &&
      actor.api_key_id &&
      input.creator_api_key_id === actor.api_key_id
    ) {
      return deny(
        "INVALID_TRANSITION",
        "Cannot review a ticket you created as executor.",
      );
    }
    if (outcome === "cancel") {
      const soft = collectSoftBreaches(charter, input.soft_observations);
      return allow("cancelled", soft);
    }
    if (outcome === "needs_changes") {
      const soft = collectSoftBreaches(charter, input.soft_observations);
      return allow("proposed", soft);
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

  if (verb === "ticket_update_charter") {
    if (kind !== "mandate") {
      return deny(
        "INVALID_TRANSITION",
        "ticket_update_charter applies only to mandate tickets.",
      );
    }
    if (!canUpdateCharter(actor)) {
      return privilegedRequired(
        "Updating a mandate charter requires founder or integrator.",
      );
    }
    if (isExecutor(actor)) {
      return privilegedRequired(
        "Executors cannot modify a mandate or its charter.",
      );
    }
    const patch = input.charter_patch as CharterPatch | undefined;
    if (!patch) {
      return deny(
        "INVALID_TRANSITION",
        "ticket_update_charter requires charter_patch in transition input.",
      );
    }
    const applied = applyCharterPatch(actor, charter, patch);
    if (!applied.ok) {
      return deny(applied.code, applied.message);
    }
    const soft = collectSoftBreaches(charter, input.soft_observations);
    return allow(undefined, soft);
  }

  if (
    verb === "ticket_approve" &&
    kind === "epic" &&
    status === "proposed" &&
    input.epic_precheck &&
    !input.epic_precheck.ok
  ) {
    if (isIntegrator(actor)) {
      return deny(
        "PRECHECK_FAILED",
        "Integrator epic approval requires a passing pre-check.",
        { violations: input.epic_precheck.violations },
      );
    }
    if (isFounder(actor) && !input.override_precheck) {
      return deny(
        "PRECHECK_FAILED",
        "Founder epic approval with failing pre-check requires override_precheck.",
        { violations: input.epic_precheck.violations },
      );
    }
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
      kind,
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
  "ticket_update_charter",
  "ticket_review",
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
