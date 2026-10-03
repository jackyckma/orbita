import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ApiErrorBodySchema } from "@orbita/platform";
import { createLogger } from "@orbita/platform";
import type { AdminDb } from "./settings.js";

/** Admin routes: GET/PATCH /v1/admin/harnesses (mounted under adminApp). */
import {
  assertHarnessPatchBody,
  listAdminHarnesses,
  patchAdminHarnessEnabled,
  type AdminHarnessRow,
} from "./harnesses.js";

const logger = createLogger(process.env.NODE_ENV ?? "development");

const AdminHarnessSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string(),
  name: z.string(),
  template_id: z.string(),
  enabled: z.boolean(),
  cron: z.string().nullable(),
  timezone: z.string(),
  next_run_at: z.string().datetime().nullable(),
  last_run_at: z.string().datetime().nullable(),
  session_policy: z.enum(["sticky", "per_run"]),
  latest_run: z
    .object({
      status: z.string(),
      started_at: z.string().datetime(),
      finished_at: z.string().datetime().nullable(),
      error: z.string().nullable(),
    })
    .nullable(),
});

export function createAdminHarnessRoutes(adminDb: AdminDb): OpenAPIHono {
  const app = new OpenAPIHono();

  const listRoute = createRoute({
    method: "get",
    path: "/harnesses",
    tags: ["Admin"],
    summary: "List harnesses (all tenants, read-only)",
    responses: {
      200: {
        description: "Harness list",
        content: {
          "application/json": {
            schema: z.object({ harnesses: z.array(AdminHarnessSchema) }),
          },
        },
      },
    },
  });

  app.openapi(listRoute, async (c) => {
    const harnesses = await listAdminHarnesses(adminDb);
    return c.json({ harnesses }, 200);
  });

  const patchRoute = createRoute({
    method: "patch",
    path: "/harnesses/{id}",
    tags: ["Admin"],
    summary:
      "Pause or resume a harness (enabled only). Does not change next_run_at; re-enabling may run one catch-up on the next scheduler tick.",
    request: {
      params: z.object({ id: z.string().uuid() }),
    },
    responses: {
      200: {
        description: "Updated harness",
        content: {
          "application/json": {
            schema: z.object({ harness: AdminHarnessSchema }),
          },
        },
      },
      400: {
        description: "Invalid request",
        content: { "application/json": { schema: ApiErrorBodySchema } },
      },
      404: {
        description: "Not found",
        content: { "application/json": { schema: ApiErrorBodySchema } },
      },
    },
  });

  app.openapi(patchRoute, async (c) => {
    const { id } = c.req.valid("param");
    const raw = await c.req.json().catch(() => null);
    const { enabled, reason } = assertHarnessPatchBody(raw);
    const harness = await patchAdminHarnessEnabled(adminDb, id, enabled);
    logger.info(
      {
        event: "harness_admin_toggle",
        harness_id: harness.id,
        client_id: harness.client_id,
        enabled,
        reason,
      },
      "harness admin toggle",
    );
    return c.json({ harness }, 200);
  });

  return app;
}

export type { AdminHarnessRow };
