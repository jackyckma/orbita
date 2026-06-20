import { randomUUID } from "node:crypto";
import type { Context, Next } from "hono";
import { createMiddleware } from "hono/factory";

export const REQUEST_ID_HEADER = "x-request-id";

export function createRequestId(): string {
  return randomUUID();
}

export const requestIdMiddleware = createMiddleware(async (c, next) => {
  const incoming = c.req.header(REQUEST_ID_HEADER);
  const requestId = incoming && incoming.length > 0 ? incoming : createRequestId();
  c.set("requestId", requestId);
  c.header(REQUEST_ID_HEADER, requestId);
  await next();
});

export function getRequestId(c: Context): string {
  return c.get("requestId") ?? createRequestId();
}

declare module "hono" {
  interface ContextVariableMap {
    requestId: string;
  }
}

export type { Context, Next };
