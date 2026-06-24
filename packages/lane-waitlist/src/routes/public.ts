import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { badRequest } from "@orbita/platform";
import type { WaitlistEnv } from "../config.js";
import { parseAllowedOrigins } from "../config.js";
import type { WaitlistDb } from "../db/client.js";
import { createWaitlistEntry } from "../service.js";

function applyCors(c: { header: (name: string, value: string) => void; req: { header: (name: string) => string | undefined } }, allowed: string[]) {
  const origin = c.req.header("Origin");
  if (origin && allowed.includes(origin)) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Vary", "Origin");
  }
  c.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type");
}

export function createWaitlistPublicRoutes(db: WaitlistDb, env: WaitlistEnv): OpenAPIHono {
  const app = new OpenAPIHono();
  const allowedOrigins = parseAllowedOrigins(env.ORBITA_WAITLIST_ALLOWED_ORIGINS);

  app.options("/waitlist", (c) => {
    applyCors(c, allowedOrigins);
    return c.body(null, 204);
  });

  const submitRoute = createRoute({
    method: "post",
    path: "/waitlist",
    tags: ["Waitlist"],
    summary: "Join the hosted API waitlist (public)",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              email: z.string().email(),
              message: z.string().max(2000).optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Waitlist entry created",
        content: {
          "application/json": {
            schema: z.object({
              id: z.string().uuid(),
              email: z.string(),
              status: z.string(),
              created_at: z.string(),
            }),
          },
        },
      },
    },
  });

  app.openapi(submitRoute, async (c) => {
    applyCors(c, allowedOrigins);
    const origin = c.req.header("Origin");
    if (origin && !allowedOrigins.includes(origin)) {
      throw badRequest("Origin not allowed");
    }
    const body = c.req.valid("json");
    const entry = await createWaitlistEntry(db, body);
    return c.json(
      {
        id: entry.id,
        email: entry.email,
        status: entry.status,
        created_at: entry.created_at,
      },
      201,
    );
  });

  return app;
}
