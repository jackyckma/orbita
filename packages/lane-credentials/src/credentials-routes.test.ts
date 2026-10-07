import { describe, expect, it, vi, afterEach } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import { createAdminAuthGuard } from "@orbita/auth";
import {
  createErrorHandler,
  createLogger,
  notFound,
  requestIdMiddleware,
} from "@orbita/platform";
import { createCredentialAdminRoutes } from "./routes/credentials.js";
import * as service from "./service.js";

const adminToken = "test-admin-token";
const secretsKey = "test-secrets-key-for-unit-tests";

function adminApp() {
  const app = new OpenAPIHono();
  const logger = createLogger("test");
  app.onError(createErrorHandler(logger));
  app.use("*", requestIdMiddleware);
  app.route(
    "/",
    createCredentialAdminRoutes(
      { db: {} } as never,
      secretsKey,
      createAdminAuthGuard(adminToken),
    ),
  );
  return app;
}

describe("credential admin routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("PUT rotate returns metadata without secret", async () => {
    vi.spyOn(service, "replaceCredentialSecret").mockResolvedValue({
      client_id: "personal-jacky",
      name: "github_read",
      scopes: ["repo:read"],
      created_at: "2026-01-01T00:00:00.000Z",
      rotated_at: "2026-10-07T09:00:00.000Z",
      expires_at: null,
    });
    const res = await adminApp().request(
      "http://localhost/credentials/personal-jacky/github_read",
      {
        method: "PUT",
        headers: {
          "x-orbita-admin-token": adminToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ secret: "super-secret-token" }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("secret");
    expect(body.rotated_at).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain("super-secret-token");
  });

  it("PUT 404 when credential missing", async () => {
    vi.spyOn(service, "replaceCredentialSecret").mockRejectedValue(
      notFound("Credential not found: missing"),
    );
    const res = await adminApp().request(
      "http://localhost/credentials/c/missing",
      {
        method: "PUT",
        headers: {
          "x-orbita-admin-token": adminToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ secret: "x" }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("DELETE requires confirm query", async () => {
    const del = vi.spyOn(service, "deleteCredential").mockResolvedValue(undefined);
    const res = await adminApp().request(
      "http://localhost/credentials/c/n?confirm=wrong",
      {
        method: "DELETE",
        headers: { "x-orbita-admin-token": adminToken },
      },
    );
    expect(res.status).toBe(400);
    expect(del).not.toHaveBeenCalled();
  });

  it("DELETE succeeds with matching confirm", async () => {
    const del = vi.spyOn(service, "deleteCredential").mockResolvedValue(undefined);
    const res = await adminApp().request(
      "http://localhost/credentials/c/my-cred?confirm=my-cred",
      {
        method: "DELETE",
        headers: { "x-orbita-admin-token": adminToken },
      },
    );
    expect(res.status).toBe(204);
    expect(del).toHaveBeenCalledWith(expect.anything(), "c", "my-cred");
  });

  it("returns 403 without admin auth", async () => {
    const res = await adminApp().request(
      "http://localhost/credentials/c/n",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: "x" }),
      },
    );
    expect(res.status).toBe(403);
  });
});
