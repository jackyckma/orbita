import {
  createTicketsDb,
  parseFounderKeyIds,
  parseIntegratorKeyIds,
  parseKeyMandates,
  type TicketActorConfig,
  type TicketRepository,
} from "@orbita/tickets";
import type { PlatformEnv } from "@orbita/platform";
import { shouldMountTicketRoutes } from "./tickets-mount.js";

export type McpTicketsDeps = {
  ticketsEnabled: boolean;
  tickets?: { repository: TicketRepository; actorConfig: TicketActorConfig };
};

let sharedTicketsDeps: McpTicketsDeps | undefined;
let sharedTicketsCacheKey: string | undefined;

/** @internal test-only */
export function resetSharedTicketsDepsCache(): void {
  sharedTicketsDeps = undefined;
  sharedTicketsCacheKey = undefined;
}

function ticketsCacheKey(platformEnv: PlatformEnv, databaseUrl: string): string {
  return [
    databaseUrl,
    platformEnv.ORBITA_TICKETS_ENABLED ?? "",
    platformEnv.ORBITA_TICKETS_FOUNDER_KEY_IDS ?? "",
    platformEnv.ORBITA_TICKETS_INTEGRATOR_KEY_IDS ?? "",
    platformEnv.ORBITA_TICKETS_KEY_MANDATES ?? "",
  ].join("\0");
}

function buildTicketsDepsOnce(
  platformEnv: PlatformEnv,
  databaseUrl: string,
): McpTicketsDeps {
  const founderKeyIds = parseFounderKeyIds(platformEnv);
  const integratorKeyIds = parseIntegratorKeyIds(platformEnv);
  const keyMandates = parseKeyMandates(platformEnv.ORBITA_TICKETS_KEY_MANDATES);
  const repository = createTicketsDb(databaseUrl);
  return {
    ticketsEnabled: true,
    tickets: {
      repository,
      actorConfig: { founderKeyIds, integratorKeyIds, keyMandates },
    },
  };
}

/**
 * Shared tickets runtime for MCP and REST mount — one repository pool per process.
 * When the flag is off, returns immediately without allocating a DB client.
 */
export function buildMcpTicketsDeps(
  platformEnv: PlatformEnv,
  databaseUrl: string,
): McpTicketsDeps {
  if (!shouldMountTicketRoutes(platformEnv)) {
    return { ticketsEnabled: false };
  }
  const key = ticketsCacheKey(platformEnv, databaseUrl);
  if (sharedTicketsDeps && sharedTicketsCacheKey === key) {
    return sharedTicketsDeps;
  }
  sharedTicketsDeps = buildTicketsDepsOnce(platformEnv, databaseUrl);
  sharedTicketsCacheKey = key;
  return sharedTicketsDeps;
}
