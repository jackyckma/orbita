import { createMiddleware } from "hono/factory";
import { tooManyRequests } from "@orbita/platform";
import type { AuthDb } from "../db/client.js";
import type { AuthContext } from "../middleware/auth.js";
import { incrementRateLimitCount } from "../rate-limit/store.js";
import { isOverLimit, retryAfterSeconds, windowStartForMinute } from "../rate-limit/window.js";

export function createRateLimitMiddleware(
  authDb: AuthDb,
  defaultLimitPerMinute: number,
) {
  return createMiddleware<{ Variables: { auth: AuthContext } }>(async (c, next) => {
    const auth = c.get("auth");
    const limit = auth.apiKey.rateLimitPerMinute ?? defaultLimitPerMinute;
    const now = new Date();
    const windowStart = windowStartForMinute(now);
    const count = await incrementRateLimitCount(authDb, auth.apiKey.id, windowStart);

    if (isOverLimit(count, limit)) {
      const retryAfter = retryAfterSeconds(now);
      throw tooManyRequests(
        "Rate limit exceeded",
        { retry_after_seconds: retryAfter, limit_per_minute: limit },
        { "Retry-After": String(retryAfter) },
      );
    }

    await next();
  });
}
