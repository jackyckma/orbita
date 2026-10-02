import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { createMiddleware } from "hono/factory";
import { describe, expect, it, beforeEach } from "vitest";
import {
  OPENAPI_PRIVATE_PATH_PREFIXES,
  filterOpenApiDocument,
  registerPublicCallerOpenApiRoute,
  resetPublicOpenApiCache,
} from "./openapi-public.js";

const requireBearer = createMiddleware(async (c, next) => {
  if (!c.req.header("authorization")?.startsWith("Bearer ")) {
    return c.json({ error: { message: "Missing or invalid Authorization header" } }, 401);
  }
  await next();
});

const requireAdminToken = createMiddleware(async (c, next) => {
  if (c.req.header("x-orbita-admin-token") !== "admin-token") {
    return c.json({ error: { message: "Unauthorized" } }, 401);
  }
  await next();
});

function buildTestApiApp(): OpenAPIHono {
  const app = new OpenAPIHono();

  registerPublicCallerOpenApiRoute(app, "0.0.0-test");

  const adminApp = new OpenAPIHono();
  const adminProbeRoute = createRoute({
    method: "get",
    path: "/test",
    tags: ["Admin"],
    summary: "Admin probe (test only)",
    responses: {
      200: {
        description: "ok",
        content: {
          "application/json": {
            schema: z.object({ ok: z.literal(true) }),
          },
        },
      },
    },
  });
  adminApp.use("*", requireAdminToken);
  adminApp.openapi(adminProbeRoute, (c) => c.json({ ok: true as const }));
  app.route("/v1/admin", adminApp);

  const inboundApp = new OpenAPIHono();
  const inboundRoute = createRoute({
    method: "post",
    path: "/inbound/email",
    tags: ["Inbound"],
    summary: "Inbound email probe",
    responses: {
      403: {
        description: "forbidden",
        content: {
          "application/json": {
            schema: z.object({ error: z.string() }),
          },
        },
      },
    },
  });
  inboundApp.openapi(inboundRoute, (c) => c.json({ error: "Invalid inbound token" }, 403));
  app.route("/v1", inboundApp);

  const protectedApp = new OpenAPIHono();
  protectedApp.use("*", requireBearer);

  const whoamiRoute = createRoute({
    method: "get",
    path: "/whoami",
    tags: ["Auth"],
    responses: {
      200: {
        description: "ok",
        content: {
          "application/json": {
            schema: z.object({ client_id: z.string() }),
          },
        },
      },
    },
  });
  protectedApp.openapi(whoamiRoute, (c) => c.json({ client_id: "test" }));

  const sessionsRoute = createRoute({
    method: "get",
    path: "/sessions",
    tags: ["Sessions"],
    responses: {
      200: {
        description: "ok",
        content: {
          "application/json": {
            schema: z.object({ sessions: z.array(z.unknown()) }),
          },
        },
      },
    },
  });
  protectedApp.openapi(sessionsRoute, (c) => c.json({ sessions: [] }));

  const notesRoute = createRoute({
    method: "get",
    path: "/notes",
    tags: ["Notes"],
    responses: {
      200: {
        description: "ok",
        content: {
          "application/json": {
            schema: z.object({ notes: z.array(z.unknown()) }),
          },
        },
      },
    },
  });
  protectedApp.openapi(notesRoute, (c) => c.json({ notes: [] }));

  app.route("/v1", protectedApp);

  return app;
}

describe("filterOpenApiDocument", () => {
  it("drops paths under private prefixes", () => {
    const doc = {
      paths: {
        "/v1/sessions": {},
        "/v1/admin/test": {},
        "/v1/inbound/email": {},
      },
    };
    const filtered = filterOpenApiDocument(doc);
    expect(filtered.paths).toHaveProperty("/v1/sessions");
    for (const prefix of OPENAPI_PRIVATE_PATH_PREFIXES) {
      for (const path of Object.keys(filtered.paths ?? {})) {
        expect(path.startsWith(prefix)).toBe(false);
      }
    }
  });
});

describe("GET /v1/openapi.json", () => {
  beforeEach(() => {
    resetPublicOpenApiCache();
  });

  it("is public and lists caller paths only", async () => {
    const app = buildTestApiApp();
    const res = await app.request("http://localhost/v1/openapi.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")?.includes("application/json")).toBe(true);

    const body = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(body.openapi).toBe("3.1.0");
    expect(body.paths).toHaveProperty("/v1/sessions");
    expect(body.paths).toHaveProperty("/v1/notes");

    for (const path of Object.keys(body.paths)) {
      for (const prefix of OPENAPI_PRIVATE_PATH_PREFIXES) {
        expect(path.startsWith(prefix)).toBe(false);
      }
    }
  });

  it("keeps protected routes unauthorized", async () => {
    const app = buildTestApiApp();
    const whoami = await app.request("http://localhost/v1/whoami");
    expect(whoami.status).toBe(401);
    const sessions = await app.request("http://localhost/v1/sessions");
    expect(sessions.status).toBe(401);
  });

  it("does not change admin or inbound auth behaviour", async () => {
    const app = buildTestApiApp();
    const admin = await app.request("http://localhost/v1/admin/test");
    expect(admin.status).toBe(401);

    const inbound = await app.request("http://localhost/v1/inbound/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(inbound.status).toBe(403);
  });
});
