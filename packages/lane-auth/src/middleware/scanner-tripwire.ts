import { createMiddleware } from "hono/factory";
import type { AuthFailGuard } from "../auth-fail/guard.js";

const SCANNER_DECOY_PATHS = new Set([
  "/.env",
  "/wp-admin",
  "/wp-login.php",
  "/.git/config",
  "/phpmyadmin",
]);

export function createScannerTripwireMiddleware(guard: AuthFailGuard) {
  return createMiddleware(async (c, next) => {
    const path = c.req.path;
    if (SCANNER_DECOY_PATHS.has(path)) {
      guard.checkBlocked(c, path);
      guard.recordScannerHit(c, path);
      return c.text("Not Found", 404);
    }
    await next();
  });
}

export { SCANNER_DECOY_PATHS };
