import { describe, expect, it, vi, afterEach } from "vitest";
import { Hono } from "hono";
import {
  createErrorHandler,
  createLogger,
  keySuspended,
  requestIdMiddleware,
} from "@orbita/platform";
import { createAuthMiddleware } from "./auth.js";
import * as apiKeysService from "../services/api-keys.js";
import type { ApiKeyRow } from "../db/schema.js";

function authApp() {
  const app = new Hono();
  const logger = createLogger("test");
  app.onError(createErrorHandler(logger));
  app.use("*", requestIdMiddleware);
  app.use("*", createAuthMiddleware({ db: {} } as never));
  app.get("/protected", (c) => c.json({ ok: true }));
  return app;
}

const activeRow = {
  id: "00000000-0000-4000-8000-000000000001",
  keyPrefix: "orb_test",
  keyHash: "hash",
  allowedClientIds: ["client-a"],
  scopes: ["sessions:use"],
  label: null,
  purpose: null,
  rateLimitPerMinute: null,
  expiresAt: null,
  suspendedAt: null,
  revokedAt: null,
  createdAt: new Date(),
} satisfies ApiKeyRow;

describe("createAuthMiddleware", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects suspended keys with key_suspended", async () => {
    vi.spyOn(apiKeysService, "resolveApiKeyBearerToken").mockRejectedValue(
      keySuspended(),
    );
    const res = await authApp().request("http://localhost/protected", {
      headers: {
        Authorization: "Bearer orb_secret",
        "x-orbita-client-id": "client-a",
      },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("key_suspended");
  });

  it("allows active keys", async () => {
    vi.spyOn(apiKeysService, "resolveApiKeyBearerToken").mockResolvedValue(
      activeRow,
    );
    const res = await authApp().request("http://localhost/protected", {
      headers: {
        Authorization: "Bearer orb_secret",
        "x-orbita-client-id": "client-a",
      },
    });
    expect(res.status).toBe(200);
  });
});
