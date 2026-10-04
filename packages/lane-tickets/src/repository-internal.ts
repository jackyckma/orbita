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
