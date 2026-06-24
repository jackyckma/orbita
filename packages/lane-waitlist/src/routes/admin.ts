import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { WaitlistDb } from "../db/client.js";
import { listWaitlistEntries, updateWaitlistEntry } from "../service.js";

export function createWaitlistAdminRoutes(db: WaitlistDb): OpenAPIHono {
  const app = new OpenAPIHono();

  const listRoute = createRoute({
    method: "get",
    path: "/waitlist",
    tags: ["Admin"],
    summary: "List waitlist entries",
    request: {
      query: z.object({
        status: z.enum(["pending", "approved", "rejected"]).optional(),
      }),
    },
    responses: {
      200: {
        description: "Waitlist entries",
        content: {
          "application/json": {
            schema: z.object({
              entries: z.array(z.record(z.unknown())),
            }),
          },
        },
      },
    },
  });

  app.openapi(listRoute, async (c) => {
    const { status } = c.req.valid("query");
    const entries = await listWaitlistEntries(db, status);
    return c.json({ entries }, 200);
  });

  const patchRoute = createRoute({
    method: "patch",
    path: "/waitlist/{entry_id}",
    tags: ["Admin"],
    summary: "Update waitlist entry status",
    request: {
      params: z.object({ entry_id: z.string().uuid() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              status: z.enum(["pending", "approved", "rejected"]),
              notes: z.string().max(2000).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Updated entry",
        content: {
          "application/json": {
            schema: z.object({ entry: z.record(z.unknown()) }),
          },
        },
      },
    },
  });

  app.openapi(patchRoute, async (c) => {
    const { entry_id } = c.req.valid("param");
    const body = c.req.valid("json");
    const entry = await updateWaitlistEntry(db, entry_id, body);
    return c.json({ entry }, 200);
  });

  return app;
}
