import { describe, expect, it } from "vitest";
import { OrbitaError, toApiErrorBody } from "./errors.js";

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
});
