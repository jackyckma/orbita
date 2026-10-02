import type { MemoryEnv } from "./config.js";
import type { EmbedFailureReason } from "./embed.js";
import {
  logEmbedBreakerClosed,
  logEmbedBreakerOpened,
} from "./embed-log.js";

export const EMBED_RATE_LIMIT_BREAKER_MS = 60_000;

let breakerOpenUntil = 0;

export function isRateLimitEmbedFailure(
  failure: EmbedFailureReason,
): boolean {
  if (failure.reason === "http_error" && failure.httpStatus === 429) {
    return true;
  }
  if (failure.reason === "minimax_status") {
    return failure.statusCode === 1002 || failure.statusCode === 2045;
  }
  return false;
}

export function resetEmbedRateLimitBreakerForTests(): void {
  breakerOpenUntil = 0;
}

export function setEmbedRateLimitBreakerOpenUntilForTests(until: number): void {
  breakerOpenUntil = until;
}

export function getEmbedRateLimitBreakerOpenUntilForTests(): number {
  return breakerOpenUntil;
}

export type EmbedBreakerGate =
  | { blocked: true; failure: EmbedFailureReason }
  | { blocked: false };

export function gateEmbedRateLimitBreaker(now = Date.now()): EmbedBreakerGate {
  if (breakerOpenUntil > now) {
    return { blocked: true, failure: { reason: "rate_limited_breaker" } };
  }
  if (breakerOpenUntil > 0 && now >= breakerOpenUntil) {
    breakerOpenUntil = 0;
    logEmbedBreakerClosed();
  }
  return { blocked: false };
}

export function recordEmbedRateLimitFailure(
  env: MemoryEnv,
  failure: EmbedFailureReason,
  now = Date.now(),
): void {
  if (!isRateLimitEmbedFailure(failure)) {
    return;
  }
  if (breakerOpenUntil > now) {
    return;
  }
  breakerOpenUntil = now + EMBED_RATE_LIMIT_BREAKER_MS;
  logEmbedBreakerOpened(env);
}
