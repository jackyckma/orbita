import type { Context } from "hono";
import pino from "pino";
import { getRequestId } from "./middleware/request-id.js";

export type Logger = pino.Logger;

export function createLogger(env: string): Logger {
  return pino({
    level: env === "production" ? "info" : "debug",
    base: { service: "orbita-api" },
  });
}

export function logRequest(
  logger: Logger,
  c: Context,
  status: number,
  durationMs: number,
): void {
  logger.info(
    {
      request_id: getRequestId(c),
      method: c.req.method,
      path: c.req.path,
      status,
      duration_ms: durationMs,
    },
    "request completed",
  );
}
