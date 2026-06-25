import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { AuthDb } from "@orbita/auth";
import type { WaitlistEnv } from "../config.js";
import type { WaitlistDb } from "../db/client.js";
import {
  approveWaitlistEntryWithInvite,
  listWaitlistEntries,
  updateWaitlistEntry,
} from "../service.js";

export type WaitlistAdminDeps = {
  waitlistDb: WaitlistDb;
  authDb: AuthDb;
  waitlistEnv: WaitlistEnv;
};

export function createWaitlistAdminRoutes(deps: WaitlistAdminDeps): OpenAPIHono {
  const { waitlistDb, authDb, waitlistEnv } = deps;
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
    const entries = await listWaitlistEntries(waitlistDb, status);
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
              send_invite: z.boolean().optional(),
              client_id: z.string().min(1).max(128).optional(),
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
            schema: z.object({
              entry: z.record(z.unknown()),
              api_key: z.string().optional(),
              invite_sent: z.boolean().optional(),
            }),
          },
        },
      },
    },
  });

  app.openapi(patchRoute, async (c) => {
    const { entry_id } = c.req.valid("param");
    const body = c.req.valid("json");

    if (body.status === "approved") {
      const result = await approveWaitlistEntryWithInvite(waitlistDb, authDb, waitlistEnv, entry_id, {
        send_invite: body.send_invite ?? false,
        client_id: body.client_id,
        notes: body.notes,
      });
      return c.json(
        {
          entry: result.entry,
          api_key: result.api_key,
          invite_sent: result.invite_sent,
        },
        200,
      );
    }

    const entry = await updateWaitlistEntry(waitlistDb, entry_id, body);
    return c.json({ entry }, 200);
  });

  return app;
}
