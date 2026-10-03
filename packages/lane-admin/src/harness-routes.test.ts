import { describe, expect, it, vi } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import {
  createErrorHandler,
  createLogger,
  notFound,
  requestIdMiddleware,
} from "@orbita/platform";
import { createAdminAuthMiddleware } from "./middleware.js";
import { createAdminHarnessRoutes } from "./harness-routes.js";
import type { AdminHarnessRow } from "./harnesses.js";
import * as harnessesModule from "./harnesses.js";

const sampleHarness: AdminHarnessRow = {
  id: "00000000-0000-4000-8000-000000000010",
  client_id: "client-a",
  name: "supply",
  template_id: "editorial-supply@v1",
  enabled: true,
  cron: "0 7 * * *",
  timezone: "UTC",
  next_run_at: "2026-10-04T07:00:00.000Z",
  last_run_at: null,
  session_policy: "sticky",
  latest_run: {
    status: "succeeded",
    started_at: "2026-10-03T07:00:00.000Z",
    finished_at: "2026-10-03T07:05:00.000Z",
    error: null,
  },
};

function adminApp() {
  const adminDb = { db: {}, sql: vi.fn() } as never;
  const app = new OpenAPIHono();
  const logger = createLogger("test");
  app.onError(createErrorHandler(logger));
  app.use("*", requestIdMiddleware);
  app.use("*", createAdminAuthMiddleware("test-admin-token", "test-secrets-key-32chars!!!!"));
  app.route("/", createAdminHarnessRoutes(adminDb));
  return app;
}

describe("admin harness routes", () => {
  it("lists harnesses across clients", async () => {
    vi.spyOn(harnessesModule, "listAdminHarnesses").mockResolvedValue([
      sampleHarness,
      { ...sampleHarness, id: "00000000-0000-4000-8000-000000000011", client_id: "client-b" },
    ]);
    const res = await adminApp().request("http://localhost/harnesses", {
      headers: { "x-orbita-admin-token": "test-admin-token" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { harnesses: AdminHarnessRow[] };
    expect(body.harnesses).toHaveLength(2);
    expect(new Set(body.harnesses.map((h) => h.client_id))).toEqual(
      new Set(["client-a", "client-b"]),
    );
    vi.restoreAllMocks();
  });

  it("returns 403 without admin auth", async () => {
    const res = await adminApp().request("http://localhost/harnesses");
    expect(res.status).toBe(403);
  });

  it("PATCH toggles enabled with reason", async () => {
    vi.spyOn(harnessesModule, "patchAdminHarnessEnabled").mockResolvedValue({
      ...sampleHarness,
      enabled: false,
    });
    const res = await adminApp().request(
      `http://localhost/harnesses/${sampleHarness.id}`,
      {
        method: "PATCH",
        headers: {
          "x-orbita-admin-token": "test-admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: false, reason: "pause AT supply" }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { harness: AdminHarnessRow };
    expect(body.harness.enabled).toBe(false);
    expect(harnessesModule.patchAdminHarnessEnabled).toHaveBeenCalledWith(
      expect.anything(),
      sampleHarness.id,
      false,
    );
    vi.restoreAllMocks();
  });

  it("PATCH 400 when reason missing", async () => {
    const res = await adminApp().request(
      `http://localhost/harnesses/${sampleHarness.id}`,
      {
        method: "PATCH",
        headers: {
          "x-orbita-admin-token": "test-admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: false }),
      },
    );
    expect(res.status).toBe(400);
  });

  it("PATCH 404 for unknown harness", async () => {
    vi.spyOn(harnessesModule, "patchAdminHarnessEnabled").mockRejectedValue(
      notFound("Harness not found"),
    );
    const res = await adminApp().request(
      "http://localhost/harnesses/00000000-0000-4000-8000-000000000099",
      {
        method: "PATCH",
        headers: {
          "x-orbita-admin-token": "test-admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: true, reason: "resume" }),
      },
    );
    expect(res.status).toBe(404);
    vi.restoreAllMocks();
  });
});
