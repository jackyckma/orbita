import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  createTicketRoutes,
  createTicketsDb,
  parseApproverKeyIds,
  warnIfOAuthInApproverAllowlist,
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
  const approverKeyIds = parseApproverKeyIds(
    deps.platformEnv.ORBITA_TICKETS_APPROVER_KEY_IDS,
  );
  warnIfOAuthInApproverAllowlist(deps.logger, approverKeyIds);
  const repository = createTicketsDb(deps.databaseUrl);
  protectedApp.route(
    "/",
    createTicketRoutes({ repository, approverKeyIds }),
  );
}
