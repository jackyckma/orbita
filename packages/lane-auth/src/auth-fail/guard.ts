import type { Context } from "hono";
import { OrbitaError, tooManyRequests } from "@orbita/platform";
import type { Logger } from "@orbita/platform";
import type { AuthFailConfig } from "./config.js";
import { extractClientIp } from "./client-ip.js";
import { InMemoryAuthFailStore } from "./store.js";
import { extractBearerToken } from "../middleware/auth.js";

export type AuthFailureReason =
  | "missing_bearer"
  | "invalid_api_key"
  | "missing_client_id"
  | "client_id_forbidden"
  | "missing_scope"
  | "invalid_admin"
  | "oauth_unauthorized"
  | "scanner_tripwire"
  | "other";

export type AuthFailGuard = {
  checkBlocked(c: Context, path: string): void;
  recordFailure(
    c: Context,
    input: {
      path: string;
      reason: AuthFailureReason | string;
      bearerToken?: string | null;
    },
  ): void;
  recordScannerHit(c: Context, path: string): void;
  isAuthFailureError(err: unknown): boolean;
};

export function bearerKeyPrefix(token: string | null | undefined): string | null {
  if (!token) {
    return null;
  }
  const trimmed = token.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.slice(0, 12);
}

function retryAfterSeconds(
  nowMs: number,
  windowStartMs: number,
  windowSeconds: number,
  blockedUntilMs: number,
): number {
  const windowEnd = windowStartMs + windowSeconds * 1000;
  const fromWindow = Math.max(1, Math.ceil((windowEnd - nowMs) / 1000));
  const fromBlock =
    blockedUntilMs > nowMs
      ? Math.max(1, Math.ceil((blockedUntilMs - nowMs) / 1000))
      : 0;
  return Math.max(fromWindow, fromBlock, 1);
}

export function createAuthFailGuard(
  config: AuthFailConfig,
  logger: Logger,
  store: InMemoryAuthFailStore = new InMemoryAuthFailStore(),
): AuthFailGuard {
  const rollWindow = (state: { windowStartMs: number; failureCount: number }, nowMs: number) => {
    const windowMs = config.windowSeconds * 1000;
    if (nowMs - state.windowStartMs >= windowMs) {
      state.windowStartMs = nowMs;
      state.failureCount = 0;
    }
  };

  const clientIp = (c: Context) =>
    extractClientIp(
      {
        "x-forwarded-for": c.req.header("x-forwarded-for"),
        "x-real-ip": c.req.header("x-real-ip"),
      },
      config.trustedProxyHops,
    );

  const throwIfBlocked = (ip: string, path: string, nowMs: number): void => {
    const state = store.get(ip);
    rollWindow(state, nowMs);
    if (state.blockedUntilMs > nowMs) {
      const retryAfter = retryAfterSeconds(
        nowMs,
        state.windowStartMs,
        config.windowSeconds,
        state.blockedUntilMs,
      );
      logger.warn(
        {
          event: "auth_fail_limited",
          ip,
          path,
          reason: "ip_blocked",
          retry_after_seconds: retryAfter,
        },
        "auth failure rate limit",
      );
      throw tooManyRequests(
        "Too many failed authentication attempts",
        { retry_after_seconds: retryAfter },
        { "Retry-After": String(retryAfter) },
      );
    }
    if (state.failureCount >= config.maxFailures) {
      const retryAfter = retryAfterSeconds(
        nowMs,
        state.windowStartMs,
        config.windowSeconds,
        state.blockedUntilMs,
      );
      logger.warn(
        {
          event: "auth_fail_limited",
          ip,
          path,
          reason: "failure_budget_exceeded",
          failure_count: state.failureCount,
          retry_after_seconds: retryAfter,
        },
        "auth failure rate limit",
      );
      throw tooManyRequests(
        "Too many failed authentication attempts",
        { retry_after_seconds: retryAfter },
        { "Retry-After": String(retryAfter) },
      );
    }
  };

  const addFailures = (
    ip: string,
    units: number,
    nowMs: number,
    blockSeconds?: number,
  ): void => {
    const state = store.get(ip);
    rollWindow(state, nowMs);
    if (state.windowStartMs === 0) {
      state.windowStartMs = nowMs;
    }
    state.failureCount += units;
    if (blockSeconds && blockSeconds > 0) {
      state.blockedUntilMs = Math.max(
        state.blockedUntilMs,
        nowMs + blockSeconds * 1000,
      );
    }
    store.set(ip, state);
  };

  return {
    checkBlocked(c: Context, path: string): void {
      throwIfBlocked(clientIp(c), path, Date.now());
    },

    recordFailure(c, input): void {
      const ip = clientIp(c);
      const nowMs = Date.now();
      const token =
        input.bearerToken !== undefined
          ? input.bearerToken
          : extractBearerToken(c.req.header("authorization"));
      const keyPrefix = bearerKeyPrefix(token);
      logger.warn(
        {
          event: "auth_failure",
          ip,
          path: input.path,
          reason: input.reason,
          key_prefix: keyPrefix,
        },
        "authentication failed",
      );
      addFailures(ip, 1, nowMs);
    },

    recordScannerHit(c, path): void {
      const ip = clientIp(c);
      const nowMs = Date.now();
      logger.warn(
        {
          event: "auth_failure",
          ip,
          path,
          reason: "scanner_tripwire",
          key_prefix: null,
        },
        "scanner tripwire",
      );
      addFailures(
        ip,
        config.scannerTripwireUnits,
        nowMs,
        config.scannerBlockSeconds,
      );
    },

    isAuthFailureError(err: unknown): boolean {
      return (
        err instanceof OrbitaError &&
        (err.status === 401 || err.status === 403)
      );
    },
  };
}
