import type { TicketVerb } from "../types.js";

export function isApproverKeyAllowed(
  apiKeyId: string,
  approverKeyIds: ReadonlySet<string>,
): boolean {
  return approverKeyIds.has(apiKeyId);
}

/** Human approval verbs gated by ORBITA_TICKETS_APPROVER_KEY_IDS (api key id from auth only). */
export function requiresApproverGate(
  verb: TicketVerb,
  ticketStatus?: string,
): boolean {
  if (verb === "ticket_approve") {
    return true;
  }
  if (verb === "ticket_cancel" && ticketStatus === "proposed") {
    return true;
  }
  return false;
}
