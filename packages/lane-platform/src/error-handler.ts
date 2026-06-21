import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Context } from "hono";
import type { ErrorHandler } from "hono";
import { OrbitaError, toApiErrorBody } from "./errors.js";
import type { Logger } from "./logger.js";
import { getRequestId } from "./middleware/request-id.js";

export function createErrorHandler(logger: Logger): ErrorHandler {
  return (err, c) => {
    const requestId = getRequestId(c);

    if (err instanceof OrbitaError) {
      if (err.status >= 500) {
        logger.error({ err, request_id: requestId }, err.message);
      }
      if (err.headers) {
        for (const [key, value] of Object.entries(err.headers)) {
          c.header(key, value);
        }
      }
      return c.json(
        toApiErrorBody(err, requestId),
        err.status as ContentfulStatusCode,
      );
    }

    logger.error({ err, request_id: requestId }, "unhandled error");
    const internal = new OrbitaError(
      "internal_error",
      "Internal server error",
      500,
    );
    return c.json(toApiErrorBody(internal, requestId), 500);
  };
}

export type { Context };
