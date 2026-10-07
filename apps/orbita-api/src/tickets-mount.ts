import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  createTicketRoutes,
  warnIfOAuthInPrivilegedAllowlist,
} from "@orbita/tickets";
import type { Logger } from "@orbita/platform";
import type { PlatformEnv } from "@orbita/platform";
import { buildMcpTicketsDeps } from "./mcp-tickets-deps.js";

/** Protected caller surface: routes register under `/v1/tickets` via `app.route("/v1", protectedApp)`. */
export const TICKETS_REST_MOUNT = "/v1/tickets";

export function shouldMountTicketRoutes(
  env: Pick<PlatformEnv, "ORBITA_TICKETS_ENABLED">,
): boolean {
  return env.ORBITA_TICKETS_ENABLED === "1";
}

export function mountTicketRoutesIfEnabled(
  protectedApp: OpenAPIHono,
  deps: {
    databaseUrl: string;
    platformEnv: PlatformEnv;
    logger: Logger;
  },
): void {
  if (!shouldMountTicketRoutes(deps.platformEnv)) {
    return;
  }
  const ticketsDeps = buildMcpTicketsDeps(deps.platformEnv, deps.databaseUrl);
  if (!ticketsDeps.ticketsEnabled || !ticketsDeps.tickets) {
    return;
  }
  const { repository, actorConfig } = ticketsDeps.tickets;
  warnIfOAuthInPrivilegedAllowlist(
    deps.logger,
    actorConfig.founderKeyIds ?? new Set<string>(),
    actorConfig.integratorKeyIds ?? new Set<string>(),
  );
  protectedApp.route(
    "/",
    createTicketRoutes({
      repository,
      actorConfig,
    }),
  );
}
