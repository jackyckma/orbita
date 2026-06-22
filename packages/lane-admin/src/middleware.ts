import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { forbidden } from "@orbita/platform";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "./session.js";

export function createAdminAuthMiddleware(adminToken: string, secretsKey: string) {
  return createMiddleware(async (c, next) => {
    const path = c.req.path;
    if (path.includes("/session")) {
      await next();
      return;
    }

    const headerToken = c.req.header("x-orbita-admin-token");
    const sessionCookie = getCookie(c, ADMIN_SESSION_COOKIE);
    const sessionValid = verifyAdminSessionToken(sessionCookie, secretsKey);

    if (sessionValid || (headerToken && headerToken === adminToken)) {
      await next();
      return;
    }

    throw forbidden("Invalid admin credentials");
  });
}
