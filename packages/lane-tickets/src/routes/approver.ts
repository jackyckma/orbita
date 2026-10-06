import type { TicketVerb } from "../types.js";

export function isPrivilegedKeyAllowed(
  apiKeyId: string,
  founderKeyIds: ReadonlySet<string>,
  integratorKeyIds: ReadonlySet<string>,
): boolean {
  return founderKeyIds.has(apiKeyId) || integratorKeyIds.has(apiKeyId);
}

/** @deprecated Use isPrivilegedKeyAllowed */
export function isApproverKeyAllowed(
  apiKeyId: string,
  approverKeyIds: ReadonlySet<string>,
): boolean {
  return approverKeyIds.has(apiKeyId);
}

/** Founder/integrator approval verbs gated by key allowlists (auth only). */
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
  if (verb === "ticket_update_charter") {
    return true;
  }
  return false;
}
