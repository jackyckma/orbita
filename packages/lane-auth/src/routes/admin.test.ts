import { describe, expect, it, vi, afterEach } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import {
  createErrorHandler,
  createLogger,
  requestIdMiddleware,
} from "@orbita/platform";
import { createAdminAuthGuard, createAdminRoutes } from "./admin.js";
import * as apiKeysService from "../services/api-keys.js";

const adminToken = "test-admin-token";

function adminApp() {
  const app = new OpenAPIHono();
  const logger = createLogger("test");
  app.onError(createErrorHandler(logger));
  app.use("*", requestIdMiddleware);
  app.route(
    "/",
    createAdminRoutes({ db: {} } as never, createAdminAuthGuard(adminToken)),
  );
  return app;
}

const sampleSummary = {
  id: "00000000-0000-4000-8000-000000000099",
  key_prefix: "orb_test123",
  label: "cursor-dev",
  purpose: "Cursor IDE",
  unlabelled: false,
  allowed_client_ids: ["default-client"],
  scopes: ["sessions:create", "sessions:use"],
  expires_at: null,
  rate_limit_per_minute: null,
  created_at: "2026-10-01T00:00:00.000Z",
  revoked_at: null,
  state: "active" as const,
};

describe("admin api-keys routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POST creates key with label and purpose", async () => {
    vi.spyOn(apiKeysService, "createApiKey").mockResolvedValue({
      id: sampleSummary.id,
      plaintextKey: "orb_secret_once",
      keyPrefix: sampleSummary.key_prefix,
      label: sampleSummary.label,
      purpose: sampleSummary.purpose,
      allowedClientIds: sampleSummary.allowed_client_ids,
      scopes: sampleSummary.scopes,
      expiresAt: null,
      rateLimitPerMinute: 30,
      createdAt: sampleSummary.created_at,
    });
    const res = await adminApp().request("http://localhost/api-keys", {
      method: "POST",
      headers: {
        "x-orbita-admin-token": adminToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        allowed_client_ids: ["default-client"],
        label: "cursor-dev",
        purpose: "Cursor IDE",
        rate_limit_per_minute: 30,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.label).toBe("cursor-dev");
    expect(body.purpose).toBe("Cursor IDE");
    expect(body.key).toBe("orb_secret_once");
    expect(JSON.stringify(body)).not.toContain("hash");
  });

  it("GET lists keys with unlabelled legacy rows", async () => {
    vi.spyOn(apiKeysService, "listApiKeys").mockResolvedValue([
      sampleSummary,
      {
        ...sampleSummary,
        id: "00000000-0000-4000-8000-000000000098",
        label: null,
        purpose: null,
        unlabelled: true,
      },
    ]);
    const res = await adminApp().request("http://localhost/api-keys", {
      headers: { "x-orbita-admin-token": adminToken },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { keys: Array<{ unlabelled: boolean }> };
    expect(body.keys).toHaveLength(2);
    expect(body.keys[1]?.unlabelled).toBe(true);
  });

  it("PATCH updates label and purpose", async () => {
    const patch = vi.spyOn(apiKeysService, "patchApiKey").mockResolvedValue({
      ...sampleSummary,
      label: "renamed",
      purpose: "Grok bot",
      unlabelled: false,
    });
    const res = await adminApp().request(
      `http://localhost/api-keys/${sampleSummary.id}`,
      {
        method: "PATCH",
        headers: {
          "x-orbita-admin-token": adminToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ label: "renamed", purpose: "Grok bot" }),
      },
    );
    expect(res.status).toBe(200);
    expect(patch).toHaveBeenCalledWith(
      expect.anything(),
      sampleSummary.id,
      expect.objectContaining({ label: "renamed", purpose: "Grok bot" }),
    );
  });
});
