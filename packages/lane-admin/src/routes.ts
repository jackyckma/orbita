import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { forbidden } from "@orbita/platform";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  verifyAdminSessionToken,
} from "./session.js";
import type { AdminDb } from "./settings.js";
import {
  getHttpAllowedDomains,
  setHttpAllowedDomains,
} from "./settings.js";

export function createAdminSessionRoutes(
  adminToken: string,
  secretsKey: string,
): OpenAPIHono {
  const app = new OpenAPIHono();

  const loginRoute = createRoute({
    method: "post",
    path: "/session",
    tags: ["Admin"],
    summary: "Create admin browser session",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({ admin_token: z.string().min(1) }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Session created",
        content: {
          "application/json": {
            schema: z.object({ authenticated: z.literal(true) }),
          },
        },
      },
      403: { description: "Forbidden" },
    },
  });

  app.openapi(loginRoute, async (c) => {
    const body = c.req.valid("json");
    if (body.admin_token !== adminToken) {
      throw forbidden("Invalid admin token");
    }
    const token = createAdminSessionToken(secretsKey);
    setCookie(c, ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 12 * 60 * 60,
    });
    return c.json({ authenticated: true as const }, 200);
  });

  const sessionRoute = createRoute({
    method: "get",
    path: "/session",
    tags: ["Admin"],
    summary: "Check admin session",
    responses: {
      200: {
        description: "Session status",
        content: {
          "application/json": {
            schema: z.object({ authenticated: z.boolean() }),
          },
        },
      },
    },
  });

  app.openapi(sessionRoute, async (c) => {
    const cookie = getCookie(c, ADMIN_SESSION_COOKIE);
    const header = c.req.header("x-orbita-admin-token");
    const ok =
      verifyAdminSessionToken(cookie, secretsKey) ||
      (header !== undefined && header === adminToken);
    return c.json({ authenticated: ok }, 200);
  });

  const logoutRoute = createRoute({
    method: "delete",
    path: "/session",
    tags: ["Admin"],
    summary: "Clear admin session",
    responses: { 204: { description: "Logged out" } },
  });

  app.openapi(logoutRoute, async (c) => {
    deleteCookie(c, ADMIN_SESSION_COOKIE, { path: "/" });
    return c.body(null, 204);
  });

  return app;
}

export function createAdminSettingsRoutes(
  adminDb: AdminDb,
): OpenAPIHono {
  const app = new OpenAPIHono();

  const getSettings = createRoute({
    method: "get",
    path: "/settings",
    tags: ["Admin"],
    summary: "Deployment settings (read)",
    responses: {
      200: {
        description: "Settings",
        content: {
          "application/json": {
            schema: z.object({
              http_allowed_domains: z.object({
                domains: z.array(z.string()),
                source: z.enum(["database", "environment", "none"]),
              }),
              llm_keys: z.object({
                configured: z.object({
                  minimax: z.boolean(),
                  anthropic: z.boolean(),
                }),
                note: z.string(),
              }),
            }),
          },
        },
      },
    },
  });

  app.openapi(getSettings, async (c) => {
    const http = await getHttpAllowedDomains(adminDb);
    return c.json(
      {
        http_allowed_domains: http,
        llm_keys: {
          configured: {
            minimax: Boolean(process.env.MINIMAX_API_KEY),
            anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
          },
          note: "LLM provider keys are set via deployment environment variables (.env / Zeabur).",
        },
      },
      200,
    );
  });

  const patchSettings = createRoute({
    method: "put",
    path: "/settings/http-domains",
    tags: ["Admin"],
    summary: "Update HTTP tool allowed domains",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              domains: z.array(z.string()),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Updated",
        content: {
          "application/json": {
            schema: z.object({ domains: z.array(z.string()) }),
          },
        },
      },
    },
  });

  app.openapi(patchSettings, async (c) => {
    const body = c.req.valid("json");
    const domains = await setHttpAllowedDomains(adminDb, body.domains);
    return c.json({ domains }, 200);
  });

  return app;
}
