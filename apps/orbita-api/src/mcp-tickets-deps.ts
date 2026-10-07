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

export function buildMcpTicketsDeps(
  platformEnv: PlatformEnv,
  databaseUrl: string,
): { ticketsEnabled: boolean; tickets?: { repository: TicketRepository; actorConfig: TicketActorConfig } } {
  if (!shouldMountTicketRoutes(platformEnv)) {
    return { ticketsEnabled: false };
  }
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
