import { z } from "@hono/zod-openapi";

export const ErrorCodeSchema = z.enum([
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "internal_error",
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.record(z.unknown()).optional(),
    request_id: z.string(),
  }),
});

export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

export class OrbitaError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "OrbitaError";
  }
}

export function toApiErrorBody(
  err: OrbitaError,
  requestId: string,
): ApiErrorBody {
  return {
    error: {
      code: err.code,
      message: err.message,
      details: err.details,
      request_id: requestId,
    },
  };
}

export function badRequest(
  message: string,
  details?: Record<string, unknown>,
): OrbitaError {
  return new OrbitaError("bad_request", message, 400, details);
}

export function unauthorized(message = "Unauthorized"): OrbitaError {
  return new OrbitaError("unauthorized", message, 401);
}

export function forbidden(message = "Forbidden"): OrbitaError {
  return new OrbitaError("forbidden", message, 403);
}

export function notFound(message: string): OrbitaError {
  return new OrbitaError("not_found", message, 404);
}

export function conflict(message: string): OrbitaError {
  return new OrbitaError("conflict", message, 409);
}

export function internalError(message = "Internal server error"): OrbitaError {
  return new OrbitaError("internal_error", message, 500);
}
