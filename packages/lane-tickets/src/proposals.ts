import type {
  Actor,
  MandateCharter,
  DecisionClass,
  ProposalPolicy,
  ProposalResolveOutcome,
  ProposalType,
  TicketInputRef,
  TransitionResult,
} from "./types.js";
import { isExecutor, isFounderOrIntegrator } from "./roles.js";
import type { StoredTicket, TicketRecord } from "./repository/index.js";

export type {
  DecisionClass,
  ProposalPolicy,
  ProposalResolveOutcome,
  ProposalType,
  ProposalTarget,
  TicketInputRef,
} from "./types.js";

export const DEFAULT_FOUNDER_ONLY_PROPOSAL_TYPES: ProposalType[] = [
  "charter_change_request",
  "access_or_tool_request",
];

export const DEFAULT_MAX_OPEN_PROPOSALS = 5;

const OPEN_PROPOSAL_STATUSES = new Set(["proposed", "waiting_human"]);

export function defaultProposalPolicy(charter: MandateCharter): ProposalPolicy {
  return charter.proposal_policy ?? {};
}

export function founderOnlyProposalTypes(charter: MandateCharter): ProposalType[] {
  return (
    charter.proposal_policy?.founder_only_types ??
    DEFAULT_FOUNDER_ONLY_PROPOSAL_TYPES
  );
}

export function maxOpenProposals(charter: MandateCharter): number {
  const n = charter.max_open_proposals;
  if (n === undefined || n === null) {
    return DEFAULT_MAX_OPEN_PROPOSALS;
  }
  return n;
}

export function integratorMayResolveProposalType(
  proposalType: ProposalType,
  charter: MandateCharter,
): boolean {
  return !founderOnlyProposalTypes(charter).includes(proposalType);
}

export function countOpenProposalsInMandate(
  mandate_id: string,
  tickets: Iterable<StoredTicket>,
): number {
  let n = 0;
  for (const t of tickets) {
    if (
      t.mandate_id === mandate_id &&
      t.kind === "decision" &&
      t.decision_class === "proposal" &&
      OPEN_PROPOSAL_STATUSES.has(t.status)
    ) {
      n += 1;
    }
  }
  return n;
}

export function executorCanReadTicket(
  actor: Actor,
  row: StoredTicket,
): boolean {
  if (!isExecutor(actor)) {
    return true;
  }
  const mandateId = row.mandate_id ?? (row.kind === "mandate" ? row.id : null);
  if (!mandateId) {
    return false;
  }
  return (actor.mandate_ids ?? []).includes(mandateId);
}

export function validateInputsFromForActor(
  actor: Actor,
  inputs: TicketInputRef[] | undefined,
  ticketsById: Map<string, StoredTicket>,
): TransitionResult | null {
  if (!inputs?.length || !isExecutor(actor)) {
    return null;
  }
  for (const item of inputs) {
    if (item.kind !== "ticket") {
      continue;
    }
    const refRow = ticketsById.get(item.ref);
    if (!refRow) {
      return {
        allowed: false,
        error: {
          code: "INVALID_TRANSITION",
          message: "inputs_from ticket ref is not readable in your mandate subtree.",
          details: { ref: item.ref },
        },
      };
    }
    if (!executorCanReadTicket(actor, refRow)) {
      return {
        allowed: false,
        error: {
          code: "OUTSIDE_MANDATE",
          message: "Cannot attach a ticket input outside your mandate subtree.",
          details: { ref: item.ref },
        },
      };
    }
  }
  return null;
}

export type UntrustedMarked<T> = T | { value: T; untrusted_author: true };

function markText(value: string | undefined): UntrustedMarked<string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return { value, untrusted_author: true };
}

/** Wrap proposal text fields for founder/integrator readers. */
export function markProposalUntrustedForPrivilegedReader(
  ticket: TicketRecord,
): TicketRecord {
  if (ticket.decision_class !== "proposal") {
    return ticket;
  }
  const inputs = ticket.inputs_from?.map((item) => ({
    ...item,
    ref: markText(item.ref) ?? item.ref,
    from: item.from ? (markText(item.from) as string) : item.from,
  }));
  return {
    ...ticket,
    title: markText(ticket.title) as unknown as string,
    description: markText(ticket.description) as unknown as string | undefined,
    suggested_change: markText(ticket.suggested_change) as unknown as
      | string
      | undefined,
    rationale: markText(ticket.rationale) as unknown as string | undefined,
    proposal_response: markText(ticket.proposal_response) as unknown as
      | string
      | undefined,
    inputs_from: inputs as TicketInputRef[] | undefined,
  };
}

export function viewTicketForActor(
  ticket: TicketRecord,
  actor: Actor,
): TicketRecord {
  if (isFounderOrIntegrator(actor) && ticket.decision_class === "proposal") {
    return markProposalUntrustedForPrivilegedReader(ticket);
  }
  return ticket;
}

export function statusAfterProposalResolve(
  outcome: ProposalResolveOutcome,
): "done" | "waiting_human" {
  if (outcome === "needs_info" || outcome === "deferred") {
    return "waiting_human";
  }
  return "done";
}

export function proposalTitleFromType(type: ProposalType): string {
  return `Proposal: ${type}`;
}
