import type { Actor } from "./types.js";

/** Runtime config for mapping authenticated API keys to ticket actors. */
export type TicketActorConfig = {
  /** API key ids that act as `human` (also used for approver gates on select verbs). */
  approverKeyIds: ReadonlySet<string>;
  /** Agent keys → mandate uuids they may operate in (stopgap until E-17 principals). */
  keyMandates: ReadonlyMap<string, readonly string[]>;
};

export type TicketAuthForActor = {
  apiKey: { id: string };
};

/**
 * Derive the ticket actor from authenticated key material only.
 * Request bodies and MCP tool args must never supply an actor.
 */
export function deriveTicketActor(
  auth: TicketAuthForActor,
  config: TicketActorConfig,
): Actor {
  const apiKeyId = auth.apiKey.id;
  const principal_id = `key:${apiKeyId}`;

  if (config.approverKeyIds.has(apiKeyId)) {
    return {
      type: "human",
      principal_id,
      api_key_id: apiKeyId,
    };
  }

  const bound = config.keyMandates.get(apiKeyId);
  return {
    type: "agent",
    principal_id,
    api_key_id: apiKeyId,
    mandate_ids: bound ? [...bound] : [],
  };
}
