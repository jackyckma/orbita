import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  createAuthFailGuard,
  createScannerTripwireMiddleware,
  SCANNER_DECOY_PATHS,
} from "@orbita/auth";
import { createErrorHandler, createLogger } from "@orbita/platform";

describe("auth-fail hardening wiring", () => {
  it("serves decoy paths as plain 404 without hitting other routes", async () => {
    const logger = createLogger("test");
    const guard = createAuthFailGuard(
      {
        maxFailures: 100,
        windowSeconds: 300,
        trustedProxyHops: 0,
        scannerTripwireUnits: 1,
        scannerBlockSeconds: 60,
      },
      logger,
    );
    const app = new Hono();
    app.onError(createErrorHandler(logger));
    app.use("*", createScannerTripwireMiddleware(guard));
    app.get("/v1/health", (c) => c.json({ ok: true }));

    let ipOctet = 8;
    for (const path of SCANNER_DECOY_PATHS) {
      const res = await app.request(`http://localhost${path}`, {
        headers: { "x-real-ip": `198.51.100.${ipOctet++}` },
      });
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Not Found");
    }

    const health = await app.request("http://localhost/v1/health");
    expect(health.status).toBe(200);
  });
});
