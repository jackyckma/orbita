import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getAuth, requireScope } from "@orbita/auth";
import type { TrajectoryDb } from "../db/client.js";
import { listTrajectoryEvents } from "../db/client.js";
import { buildTrajectoryReplay } from "../replay.js";

function mapTrajectoryRows(
  rows: Awaited<ReturnType<typeof listTrajectoryEvents>>,
) {
  return rows.map((row) => ({
    id: row.id,
    event_type: row.eventType,
    payload: row.payload,
    created_at: row.createdAt.toISOString(),
  }));
}

export function createTrajectoryRoutes(
  trajectoryDb: TrajectoryDb,
  assertSessionOwner: (sessionId: string, clientId: string) => Promise<void>,
): OpenAPIHono {
  const app = new OpenAPIHono();
  app.use("/sessions/*/trajectory", requireScope("sessions:use"));
  app.use("/sessions/*/trajectory/*", requireScope("sessions:use"));

  const listRoute = createRoute({
    method: "get",
    path: "/sessions/{session_id}/trajectory",
    tags: ["Trajectory"],
    request: { params: z.object({ session_id: z.string().uuid() }) },
    responses: {
      200: {
        description: "Structured trajectory",
        content: {
          "application/json": {
            schema: z.object({ events: z.array(z.record(z.unknown())) }),
          },
        },
      },
    },
  });

  app.openapi(listRoute, async (c) => {
    const auth = getAuth(c);
    const { session_id } = c.req.valid("param");
    await assertSessionOwner(session_id, auth.clientId);
    const rows = await listTrajectoryEvents(trajectoryDb, session_id, auth.clientId);
    return c.json({ events: mapTrajectoryRows(rows) });
  });

  const replayRoute = createRoute({
    method: "get",
    path: "/sessions/{session_id}/trajectory/replay",
    tags: ["Trajectory"],
    request: { params: z.object({ session_id: z.string().uuid() }) },
    responses: {
      200: {
        description: "Trajectory replay artifact for audit / eval",
        content: {
          "application/json": {
            schema: z.object({ replay: z.record(z.unknown()) }),
          },
        },
      },
    },
  });

  app.openapi(replayRoute, async (c) => {
    const auth = getAuth(c);
    const { session_id } = c.req.valid("param");
    await assertSessionOwner(session_id, auth.clientId);
    const rows = await listTrajectoryEvents(trajectoryDb, session_id, auth.clientId);
    const events = mapTrajectoryRows(rows);
    const replay = buildTrajectoryReplay(events, session_id);
    return c.json({ replay });
  });

  return app;
}
