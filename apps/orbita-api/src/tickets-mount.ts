import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  createTicketRoutes,
  createTicketsDb,
  parseFounderKeyIds,
  parseIntegratorKeyIds,
  parseKeyMandates,
  warnIfOAuthInPrivilegedAllowlist,
} from "@orbita/tickets";
import type { Logger } from "@orbita/platform";
import type { PlatformEnv } from "@orbita/platform";

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
  const founderKeyIds = parseFounderKeyIds(deps.platformEnv);
  const integratorKeyIds = parseIntegratorKeyIds(deps.platformEnv);
  warnIfOAuthInPrivilegedAllowlist(
    deps.logger,
    founderKeyIds,
    integratorKeyIds,
  );
  const keyMandates = parseKeyMandates(
    deps.platformEnv.ORBITA_TICKETS_KEY_MANDATES,
  );
  const repository = createTicketsDb(deps.databaseUrl);
  protectedApp.route(
    "/",
    createTicketRoutes({
      repository,
      actorConfig: { founderKeyIds, integratorKeyIds, keyMandates },
    }),
  );
}
