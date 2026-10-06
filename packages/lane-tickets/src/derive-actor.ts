import type { Actor, TicketRole } from "./types.js";

/** Runtime config for mapping authenticated API keys to ticket actors. */
export type TicketActorConfig = {
  /** API key ids with founder role (ORBITA_TICKETS_FOUNDER_KEY_IDS). */
  founderKeyIds?: ReadonlySet<string>;
  /** API key ids with integrator role. */
  integratorKeyIds?: ReadonlySet<string>;
  /** @deprecated Use founderKeyIds — kept for callers still passing approverKeyIds. */
  approverKeyIds?: ReadonlySet<string>;
  /** Executor keys → mandate uuids they may operate in (stopgap until E-17 principals). */
  keyMandates: ReadonlyMap<string, readonly string[]>;
};

export type TicketAuthForActor = {
  apiKey: { id: string };
};

function resolveRole(
  apiKeyId: string,
  config: TicketActorConfig,
): TicketRole {
  const founderIds =
    (config.founderKeyIds?.size ?? 0) > 0
      ? config.founderKeyIds!
      : (config.approverKeyIds ?? new Set<string>());
  if (founderIds.has(apiKeyId)) {
    return "founder";
  }
  if (config.integratorKeyIds?.has(apiKeyId)) {
    return "integrator";
  }
  return "executor";
}

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
  const role = resolveRole(apiKeyId, config);

  if (role === "executor") {
    const bound = config.keyMandates.get(apiKeyId);
    return {
      role,
      principal_id,
      api_key_id: apiKeyId,
      mandate_ids: bound ? [...bound] : [],
    };
  }

  return {
    role,
    principal_id,
    api_key_id: apiKeyId,
  };
}
