import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { notFound } from "@orbita/platform";
import { buildTrajectoryReplay } from "@orbita/trajectory";
import type { AdminDb } from "./settings.js";
import {
  getAdminSession,
  getUsageSummary,
  listAdminSchedulerJobs,
  listAdminSessions,
  listApiKeyMetering,
  listTrajectoryEventsForSession,
} from "./observability.js";

export type ObservabilityRouteOptions = {
  defaultRateLimitPerMinute?: number;
};

export function createAdminObservabilityRoutes(
  adminDb: AdminDb,
  options: ObservabilityRouteOptions = {},
): OpenAPIHono {
  const defaultRateLimitPerMinute = options.defaultRateLimitPerMinute ?? 120;
  const app = new OpenAPIHono();

  const usageRoute = createRoute({
    method: "get",
    path: "/usage/summary",
    tags: ["Admin"],
    summary: "Deployment usage summary (sessions, turns, tools, tokens)",
    responses: {
      200: {
        description: "Usage summary",
        content: {
          "application/json": {
            schema: z.object({ summary: z.record(z.unknown()) }),
          },
        },
      },
    },
  });

  app.openapi(usageRoute, async (c) => {
    const summary = await getUsageSummary(adminDb);
    return c.json({ summary }, 200);
  });

  const keyMeteringRoute = createRoute({
    method: "get",
    path: "/usage/keys",
    tags: ["Admin"],
    summary: "Per API key usage estimates and rate-limit counters (W17 prep)",
    responses: {
      200: {
        description: "API key metering",
        content: {
          "application/json": {
            schema: z.object({ keys: z.array(z.record(z.unknown())) }),
          },
        },
      },
    },
  });

  app.openapi(keyMeteringRoute, async (c) => {
    const keys = await listApiKeyMetering(adminDb, defaultRateLimitPerMinute);
    return c.json({ keys }, 200);
  });

  const listSessionsRoute = createRoute({
    method: "get",
    path: "/sessions",
    tags: ["Admin"],
    summary: "List recent sessions (all clients)",
    request: {
      query: z.object({
        limit: z.coerce.number().int().positive().max(200).optional(),
        client_id: z.string().optional(),
        status: z.enum(["active", "ended"]).optional(),
      }),
    },
    responses: {
      200: {
        description: "Sessions",
        content: {
          "application/json": {
            schema: z.object({ sessions: z.array(z.record(z.unknown())) }),
          },
        },
      },
    },
  });

  app.openapi(listSessionsRoute, async (c) => {
    const query = c.req.valid("query");
    const sessions = await listAdminSessions(adminDb, query);
    return c.json({ sessions }, 200);
  });

  const getSessionRoute = createRoute({
    method: "get",
    path: "/sessions/{session_id}",
    tags: ["Admin"],
    summary: "Get session by id (admin)",
    request: { params: z.object({ session_id: z.string().uuid() }) },
    responses: {
      200: {
        description: "Session",
        content: {
          "application/json": {
            schema: z.object({ session: z.record(z.unknown()) }),
          },
        },
      },
    },
  });

  app.openapi(getSessionRoute, async (c) => {
    const { session_id } = c.req.valid("param");
    const session = await getAdminSession(adminDb, session_id);
    if (!session) {
      throw notFound("Session not found");
    }
    return c.json({ session }, 200);
  });

  const replayRoute = createRoute({
    method: "get",
    path: "/sessions/{session_id}/trajectory/replay",
    tags: ["Admin"],
    summary: "Trajectory replay for any session (admin)",
    request: { params: z.object({ session_id: z.string().uuid() }) },
    responses: {
      200: {
        description: "Trajectory replay",
        content: {
          "application/json": {
            schema: z.object({ replay: z.record(z.unknown()) }),
          },
        },
      },
    },
  });

  app.openapi(replayRoute, async (c) => {
    const { session_id } = c.req.valid("param");
    const session = await getAdminSession(adminDb, session_id);
    if (!session) {
      throw notFound("Session not found");
    }
    const events = await listTrajectoryEventsForSession(adminDb, session_id);
    const replay = buildTrajectoryReplay(events, session_id);
    return c.json({ replay }, 200);
  });

  const schedulerRoute = createRoute({
    method: "get",
    path: "/scheduler/jobs",
    tags: ["Admin"],
    summary: "List scheduler jobs (all clients)",
    request: {
      query: z.object({
        limit: z.coerce.number().int().positive().max(200).optional(),
        enabled: z
          .enum(["true", "false"])
          .optional()
          .transform((v) => (v === undefined ? undefined : v === "true")),
      }),
    },
    responses: {
      200: {
        description: "Scheduler jobs",
        content: {
          "application/json": {
            schema: z.object({ jobs: z.array(z.record(z.unknown())) }),
          },
        },
      },
    },
  });

  app.openapi(schedulerRoute, async (c) => {
    const query = c.req.valid("query");
    const jobs = await listAdminSchedulerJobs(adminDb, query);
    return c.json({ jobs }, 200);
  });

  return app;
}
