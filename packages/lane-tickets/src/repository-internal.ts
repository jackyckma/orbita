import { countOpenExceptionsInSubtree } from "./exception-tasks.js";
import {
  evaluateTransition,
  initialStatusOnCreate,
} from "./transitions.js";
import type { StoredTicket, TicketEventRecord } from "./repository/index.js";
import type {
  Actor,
  MandateCharter,
  MandateCounters,
  MandateStatus,
  ParentTicketRef,
  TicketKind,
  TicketStatus,
  TicketVerb,
  TransitionInput,
} from "./types.js";

export const EMPTY_COUNTERS: MandateCounters = {
  open_epics: 0,
  open_tasks: 0,
  open_exception_tasks: 0,
  open_exception_tasks_by_type: {},
  creations_today: 0,
  writes_today: 0,
};

const TERMINAL_WORK: ReadonlySet<TicketStatus> = new Set([
  "done",
  "cancelled",
]);

const TERMINAL_EPIC: ReadonlySet<TicketStatus> = new Set([
  "done",
  "cancelled",
]);

export function mandateStatusOf(row: StoredTicket): MandateStatus | undefined {
  if (row.kind === "mandate") {
    return row.status as MandateStatus;
  }
  return row.mandate_status ?? undefined;
}

export function mandateIdOf(row: StoredTicket): string | undefined {
  if (row.kind === "mandate") {
    return row.id;
  }
  return row.mandate_id ?? undefined;
}

export function parentRef(parent: StoredTicket): ParentTicketRef {
  return {
    kind: parent.kind,
    status: parent.status,
    mandate_id: mandateIdOf(parent) ?? parent.id,
  };
}

const READ_ONLY_VERBS: ReadonlySet<TicketVerb> = new Set([
  "ticket_list",
  "ticket_get",
]);

/** Recompute mandate counters from subtree rows and today's events (same transaction view). */
export function computeLiveMandateCounters(
  mandate_id: string,
  tickets: Iterable<StoredTicket>,
  getEvents: (ticketId: string) => TicketEventRecord[],
): MandateCounters {
  const subtree: StoredTicket[] = [];
  for (const t of tickets) {
    if (t.id === mandate_id || t.mandate_id === mandate_id) {
      subtree.push(t);
    }
  }

  let open_epics = 0;
  let open_tasks = 0;
  for (const t of subtree) {
    if (t.kind === "epic" && !TERMINAL_EPIC.has(t.status)) {
      open_epics += 1;
    }
    if (
      (t.kind === "task" || t.kind === "decision") &&
      !TERMINAL_WORK.has(t.status)
    ) {
      open_tasks += 1;
    }
  }

  const todayPrefix = new Date().toISOString().slice(0, 10);
  let writes_today = 0;
  let creations_today = 0;
  for (const t of subtree) {
    for (const ev of getEvents(t.id)) {
      if (!ev.at.startsWith(todayPrefix)) {
        continue;
      }
      if (ev.verb === "ticket_create") {
        creations_today += 1;
      }
      if (!READ_ONLY_VERBS.has(ev.verb)) {
        writes_today += 1;
      }
    }
  }

  const { total, by_type } = countOpenExceptionsInSubtree(
    mandate_id,
    subtree,
  );

  return {
    open_epics,
    open_tasks,
    open_exception_tasks: total,
    open_exception_tasks_by_type: by_type,
    creations_today,
    writes_today,
  };
}

export function openChildrenCount(
  parentId: string,
  tickets: Iterable<StoredTicket>,
): number {
  let n = 0;
  for (const t of tickets) {
    if (t.parent_id !== parentId) {
      continue;
    }
    if (t.kind === "epic") {
      if (!TERMINAL_EPIC.has(t.status)) {
        n += 1;
      }
    } else if (t.kind === "task" || t.kind === "decision") {
      if (!TERMINAL_WORK.has(t.status)) {
        n += 1;
      }
    }
  }
  return n;
}

export function buildTransitionInput(
  row: StoredTicket,
  charter: MandateCharter,
  verb: TicketVerb,
  actor: Actor,
  extras?: Partial<TransitionInput>,
): TransitionInput {
  const mandate_id = mandateIdOf(row);
  const mandate_status = mandateStatusOf(row);
  return {
    kind: row.kind,
    status: row.status,
    verb,
    actor,
    source: row.source,
    git_ref: row.git_ref,
    charter,
    counters: charter.hard_limits.some((l) => l.enforcement === "server")
      ? row.mandate_counters
      : undefined,
    mandate_id,
    mandate_status,
    open_children_count:
      row.kind === "epic" ? extras?.open_children_count : undefined,
    task_class: row.task_class,
    exception_type: row.exception_type,
    requires_review: row.requires_review,
    reviewed_at: row.reviewed_at,
    decision_class: row.decision_class,
    proposal_type: row.proposal_type,
    proposer_api_key_id: row.proposer_api_key_id,
    ...extras,
  };
}

export function nextEventSeq(events: TicketEventRecord[]): number {
  if (events.length === 0) {
    return 1;
  }
  return Math.max(...events.map((e) => e.seq)) + 1;
}

export { evaluateTransition, initialStatusOnCreate };
