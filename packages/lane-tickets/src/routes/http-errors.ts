import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  OrbitaError,
  forbidden,
  getRequestId,
  notFound,
  quotaExceeded,
} from "@orbita/platform";
import type { RepositoryError } from "../repository/index.js";

export function repositoryToOrbitaError(error: RepositoryError): OrbitaError {
  switch (error.code) {
    case "NOT_FOUND":
      return notFound(error.message);
    case "VERSION_CONFLICT":
    case "GIT_READ_ONLY":
    case "LEASE_CONFLICT":
    case "INVALID_PARENT":
    case "INVALID_TRANSITION":
    case "HUMAN_ACTOR_REQUIRED":
    case "PRIVILEGED_ROLE_REQUIRED":
    case "ROLE_REQUIRED":
    case "PRECHECK_FAILED":
    case "MANDATE_NOT_ACTIVE":
    case "OUTSIDE_MANDATE":
    case "SOFT_BLOCK_THRESHOLD_EXCEEDED":
    case "HARD_LIMIT_COUNTERS_MISSING":
      return new OrbitaError("conflict", error.message, 409, {
        ticket_error: error.code,
        ...error.details,
      });
    case "HARD_LIMIT_EXCEEDED":
      if (
        error.details &&
        ("max_writes_per_day" in error.details ||
          error.message.includes("max_writes_per_day"))
      ) {
        return quotaExceeded(error.message, {
          ticket_error: error.code,
          ...error.details,
        });
      }
      return new OrbitaError("conflict", error.message, 409, {
        ticket_error: error.code,
        ...error.details,
      });
    case "IDEMPOTENCY_REPLAY":
      return new OrbitaError("conflict", error.message, 409, {
        ticket_error: error.code,
      });
    default:
      return new OrbitaError("conflict", error.message, 409, {
        ticket_error: error.code,
        ...error.details,
      });
  }
}

export function ticketErrorJson(
  c: Context,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  const requestId = getRequestId(c);
  return c.json(
    {
      error: {
        code,
        message,
        request_id: requestId,
        ...(details ? { details } : {}),
      },
    },
    status as ContentfulStatusCode,
  );
}

export function approverForbidden(): OrbitaError {
  return forbidden("Ticket approver API key not allowlisted");
}
