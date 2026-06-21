import { describe, expect, it } from "vitest";
import { OrbitaError, toApiErrorBody, tooManyRequests } from "./errors.js";

describe("errors", () => {
  it("serializes to a stable API envelope", () => {
    const err = new OrbitaError("bad_request", "invalid client_id", 400, {
      field: "client_id",
    });
    expect(toApiErrorBody(err, "req-123")).toEqual({
      error: {
        code: "bad_request",
        message: "invalid client_id",
        details: { field: "client_id" },
        request_id: "req-123",
      },
    });
  });

  it("builds rate-limited errors with 429 status", () => {
    const err = tooManyRequests("Rate limit exceeded", {
      retry_after_seconds: 12,
    });
    expect(err.code).toBe("rate_limited");
    expect(err.status).toBe(429);
    expect(err.details).toEqual({ retry_after_seconds: 12 });
  });
});
