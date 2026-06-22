import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { AdminDb } from "./settings.js";
import {
  approveDeviceAuth,
  pollDeviceAuth,
  startDeviceAuth,
} from "./device.js";
import { ADMIN_SESSION_COOKIE } from "./session.js";
import { setCookie } from "hono/cookie";
import { forbidden } from "@orbita/platform";
import { verifyAdminSessionToken } from "./session.js";
import { getCookie } from "hono/cookie";

export function createDeviceAuthRoutes(
  adminDb: AdminDb,
  secretsKey: string,
  adminToken: string,
  publicBaseUrl: string,
): OpenAPIHono {
  const app = new OpenAPIHono();

  const startRoute = createRoute({
    method: "post",
    path: "/device",
    tags: ["Auth"],
    summary: "Start admin device authorization flow",
    responses: {
      200: {
        description: "Device flow started",
        content: {
          "application/json": {
            schema: z.object({
              device_code: z.string(),
              user_code: z.string(),
              verification_url: z.string().url(),
              expires_in: z.number(),
              interval: z.number(),
            }),
          },
        },
      },
    },
  });

  app.openapi(startRoute, async (c) => {
    const result = await startDeviceAuth(adminDb, publicBaseUrl);
    return c.json(result, 200);
  });

  const pollRoute = createRoute({
    method: "get",
    path: "/device/poll",
    tags: ["Auth"],
    summary: "Poll device authorization status",
    request: {
      query: z.object({ device_code: z.string().min(1) }),
    },
    responses: {
      200: {
        description: "Poll result",
        content: {
          "application/json": {
            schema: z.object({
              status: z.enum(["pending", "approved", "expired"]),
              session_token: z.string().optional(),
            }),
          },
        },
      },
    },
  });

  app.openapi(pollRoute, async (c) => {
    const { device_code } = c.req.valid("query");
    const result = await pollDeviceAuth(adminDb, device_code);
    if (result.status === "approved") {
      setCookie(c, ADMIN_SESSION_COOKIE, result.session_token, {
        httpOnly: true,
        sameSite: "Lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 12 * 60 * 60,
      });
      return c.json({ status: "approved" as const, session_token: result.session_token }, 200);
    }
    return c.json(result, 200);
  });

  const approveRoute = createRoute({
    method: "post",
    path: "/device/approve",
    tags: ["Auth"],
    summary: "Approve a pending device code (admin session required)",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({ user_code: z.string().min(1) }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Approved",
        content: {
          "application/json": {
            schema: z.object({ approved: z.literal(true) }),
          },
        },
      },
    },
  });

  app.openapi(approveRoute, async (c) => {
    const cookie = getCookie(c, ADMIN_SESSION_COOKIE);
    const header = c.req.header("x-orbita-admin-token");
    const ok =
      verifyAdminSessionToken(cookie, secretsKey) ||
      (header !== undefined && header === adminToken);
    if (!ok) {
      throw forbidden("Admin authentication required to approve device");
    }
    const body = c.req.valid("json");
    const approved = await approveDeviceAuth(adminDb, body.user_code, secretsKey);
    if (!approved) {
      throw forbidden("Invalid or expired user code");
    }
    return c.json({ approved: true as const }, 200);
  });

  return app;
}
