import { createMiddleware } from "hono/factory";
import type { AuthFailGuard } from "../auth-fail/guard.js";

export function createAuthFailPrecheckMiddleware(guard: AuthFailGuard) {
  return createMiddleware(async (c, next) => {
    guard.checkBlocked(c, c.req.path);
    await next();
  });
}
