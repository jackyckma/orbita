import { riskWithinAutoTier } from "./risk-tier.js";
import type {
  Actor,
  ExceptionTypeDef,
  MandateCharter,
  MandateCounters,
  ParentTicketRef,
  RiskTier,
  TaskClass,
  TicketKind,
} from "./types.js";
import { isExecutor } from "./roles.js";

export function normalizeTaskClass(
  kind: TicketKind,
  task_class?: TaskClass,
): TaskClass {
  if (kind !== "task") {
    return "planned";
  }
  return task_class ?? "planned";
}

export function findExceptionTypeDef(
  charter: MandateCharter,
  exception_type: string,
): ExceptionTypeDef | undefined {
  return charter.exception_types?.find((t) => t.type === exception_type);
}

const TERMINAL_WORK = new Set(["done", "cancelled"]);

export function countOpenExceptionsInSubtree(
  mandate_id: string,
  tickets: Iterable<{
    id: string;
    mandate_id: string | null;
    kind: string;
    task_class?: TaskClass;
    exception_type?: string;
    status: string;
  }>,
): { total: number; by_type: Record<string, number> } {
  const by_type: Record<string, number> = {};
  let total = 0;
  for (const t of tickets) {
    if (t.id !== mandate_id && t.mandate_id !== mandate_id) {
      continue;
    }
    if (t.kind !== "task" || t.task_class !== "exception") {
      continue;
    }
    if (TERMINAL_WORK.has(t.status)) {
      continue;
    }
    total += 1;
    const slug = t.exception_type ?? "_unknown";
    by_type[slug] = (by_type[slug] ?? 0) + 1;
  }
  return { total, by_type };
}

export function exceptionTypeAllowsRisk(
  def: ExceptionTypeDef,
  risk_tier?: RiskTier,
): boolean {
  const max = def.risk_tier_max;
  if (!max) {
    return true;
  }
  return riskWithinAutoTier(risk_tier, max);
}

export function shouldRequireReviewOnCreate(
  kind: TicketKind,
  task_class: TaskClass,
  actor: Actor,
  initialStatus: string,
): boolean {
  if (kind === "task" && task_class === "exception") {
    return true;
  }
  if (
    isExecutor(actor) &&
    initialStatus === "approved" &&
    (kind === "epic" || kind === "task")
  ) {
    return true;
  }
  return false;
}

export function validateExceptionTaskParent(
  parent: ParentTicketRef,
  charter: MandateCharter,
  exception_type: string | undefined,
  counters: MandateCounters | undefined,
): { ok: true } | { ok: false; code: string; message: string; details?: Record<string, unknown> } {
  if (parent.kind !== "mandate" || parent.status !== "active") {
    return {
      ok: false,
      code: "INVALID_PARENT",
      message: "Exception task parent must be an active mandate.",
      details: { parent_kind: parent.kind, parent_status: parent.status },
    };
  }
  if (!exception_type) {
    return {
      ok: false,
      code: "INVALID_PARENT",
      message: "Exception tasks require exception_type.",
    };
  }
  const def = findExceptionTypeDef(charter, exception_type);
  if (!def) {
    return {
      ok: false,
      code: "INVALID_PARENT",
      message: `exception_type ${exception_type} is not defined on the mandate charter.`,
      details: { exception_type },
    };
  }
  if (counters && def.max_open !== undefined) {
    const openForType = counters.open_exception_tasks_by_type[exception_type] ?? 0;
    if (openForType >= def.max_open) {
      return {
        ok: false,
        code: "HARD_LIMIT_EXCEEDED",
        message: `Exception type ${exception_type} max_open (${def.max_open}) reached.`,
        details: { exception_type, max_open: def.max_open },
      };
    }
  }
  if (counters) {
    for (const limit of charter.hard_limits) {
      if (limit.enforcement !== "server") {
        continue;
      }
      if (
        limit.max_open_exceptions !== undefined &&
        counters.open_exception_tasks >= limit.max_open_exceptions
      ) {
        return {
          ok: false,
          code: "HARD_LIMIT_EXCEEDED",
          message: `Hard limit ${limit.id}: max_open_exceptions (${limit.max_open_exceptions}) reached.`,
          details: {
            limit_id: limit.id,
            max_open_exceptions: limit.max_open_exceptions,
          },
        };
      }
    }
  }
  return { ok: true };
}
