import { tooManyRequests } from "@orbita/platform";
import { createMiddleware } from "hono/factory";
import type { AuthDb } from "../db/client.js";
import { getAuth, type AuthContext } from "./auth.js";

export const FIXED_WINDOW_MS = 60_000;

export type IncrementRateLimitCounter = (
  keyId: string,
  windowStart: Date,
) => Promise<number>;

export type CreateRateLimitMiddlewareOptions = {
  authDb: AuthDb;
  defaultRateLimitPerMinute: number;
  now?: () => Date;
  incrementCounter?: IncrementRateLimitCounter;
};

export type FixedWindowDecision = {
  isLimited: boolean;
  retryAfterSeconds: number;
};

export function getFixedWindowStart(now: Date): Date {
  return new Date(Math.floor(now.getTime() / FIXED_WINDOW_MS) * FIXED_WINDOW_MS);
}

export function getRetryAfterSeconds(now: Date, windowStart: Date): number {
  const nextWindowStartMs = windowStart.getTime() + FIXED_WINDOW_MS;
  const remainingMs = Math.max(0, nextWindowStartMs - now.getTime());
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

export function evaluateFixedWindowRateLimit(input: {
  count: number;
  limit: number;
  now: Date;
  windowStart: Date;
}): FixedWindowDecision {
  return {
    isLimited: input.count > input.limit,
    retryAfterSeconds: getRetryAfterSeconds(input.now, input.windowStart),
  };
}

export async function incrementRateLimitCounter(
  authDb: AuthDb,
  keyId: string,
  windowStart: Date,
): Promise<number> {
  const rows = await authDb.client.unsafe<Array<{ count: number | string }>>(
    `INSERT INTO rate_limit_counters (key_id, window_start, count)
     VALUES ($1, $2::timestamptz, 1)
     ON CONFLICT (key_id, window_start)
     DO UPDATE SET count = rate_limit_counters.count + 1
     RETURNING count`,
    [keyId, windowStart.toISOString()],
  );
  const count = Number(rows[0]?.count ?? NaN);
  if (!Number.isFinite(count) || count < 1) {
    throw new Error("Failed to increment rate limit counter");
  }
  return count;
}

export function createRateLimitMiddleware({
  authDb,
  defaultRateLimitPerMinute,
  now = () => new Date(),
  incrementCounter,
}: CreateRateLimitMiddlewareOptions) {
  if (defaultRateLimitPerMinute < 1) {
    throw new Error("defaultRateLimitPerMinute must be positive");
  }

  const increment =
    incrementCounter ??
    ((keyId: string, windowStart: Date) =>
      incrementRateLimitCounter(authDb, keyId, windowStart));

  return createMiddleware<{ Variables: { auth: AuthContext } }>(
    async (c, next) => {
      const auth = getAuth(c);
      const effectiveLimit =
        auth.apiKey.rateLimitPerMinute ?? defaultRateLimitPerMinute;
      const nowAt = now();
      const windowStart = getFixedWindowStart(nowAt);
      const count = await increment(auth.apiKey.id, windowStart);
      const decision = evaluateFixedWindowRateLimit({
        count,
        limit: effectiveLimit,
        now: nowAt,
        windowStart,
      });

      if (decision.isLimited) {
        c.header("Retry-After", String(decision.retryAfterSeconds));
        throw tooManyRequests("API key rate limit exceeded", {
          current_count: count,
          limit_per_minute: effectiveLimit,
          retry_after_seconds: decision.retryAfterSeconds,
          window_start: windowStart.toISOString(),
        });
      }

      await next();
    },
  );
}
