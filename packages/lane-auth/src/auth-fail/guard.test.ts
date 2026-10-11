import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createErrorHandler, forbidden } from "@orbita/platform";
import { createAuthFailGuard } from "./guard.js";
import { InMemoryAuthFailStore } from "./store.js";
import { createScannerTripwireMiddleware } from "../middleware/scanner-tripwire.js";

function mockLogger() {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  } as unknown as import("@orbita/platform").Logger;
}

describe("createAuthFailGuard", () => {
  it("returns 429 after max failures", async () => {
    const store = new InMemoryAuthFailStore();
    const guard = createAuthFailGuard(
      {
        maxFailures: 3,
        windowSeconds: 300,
        trustedProxyHops: 0,
        scannerTripwireUnits: 5,
        scannerBlockSeconds: 600,
      },
      mockLogger(),
      store,
    );

    const app = new Hono();
    app.get("/v1/test", (c) => {
      guard.checkBlocked(c, "/v1/test");
      try {
        throw forbidden("nope");
      } catch (err) {
        if (guard.isAuthFailureError(err)) {
          try {
            guard.recordFailure(c, { path: "/v1/test", reason: "test" });
          } catch (limitErr) {
            throw limitErr;
          }
        }
        throw err;
      }
    });
    app.onError(createErrorHandler(mockLogger()));

    const headers = { "x-real-ip": "203.0.113.10" };
    expect((await app.request("/v1/test", { headers })).status).toBe(403);
    expect((await app.request("/v1/test", { headers })).status).toBe(403);
    expect((await app.request("/v1/test", { headers })).status).toBe(403);
    const limited = await app.request("/v1/test", { headers });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });

  it("scanner tripwire adds multiple units", async () => {
    const store = new InMemoryAuthFailStore();
    const guard = createAuthFailGuard(
      {
        maxFailures: 6,
        windowSeconds: 300,
        trustedProxyHops: 0,
        scannerTripwireUnits: 5,
        scannerBlockSeconds: 60,
      },
      mockLogger(),
      store,
    );
    const app = new Hono();
    app.onError(createErrorHandler(mockLogger()));
    app.use("*", createScannerTripwireMiddleware(guard));
    const res = await app.request("http://localhost/.env", {
      headers: { "x-real-ip": "203.0.113.11" },
    });
    expect(res.status).toBe(404);
    const blocked = await app.request("http://localhost/.env", {
      headers: { "x-real-ip": "203.0.113.11" },
    });
    expect(blocked.status).toBe(429);
  });
});
