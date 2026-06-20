import { eq } from "drizzle-orm";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getAuth, requireScope } from "@orbita/auth";
import type { SchedulerDb } from "../db/client.js";
import { sessionJobs } from "../db/schema.js";

export function createSchedulerRoutes(
  schedulerDb: SchedulerDb,
  assertSessionOwner: (sessionId: string, clientId: string) => Promise<void>,
): OpenAPIHono {
  const app = new OpenAPIHono();
  app.use("/sessions/*/jobs", requireScope("sessions:use"));

  const createJobRoute = createRoute({
    method: "post",
    path: "/sessions/{session_id}/jobs",
    tags: ["Scheduler"],
    request: {
      params: z.object({ session_id: z.string().uuid() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              every_seconds: z.number().int().positive(),
              task: z.record(z.unknown()),
              output_routing: z.object({
                mode: z.enum(["poll", "webhook", "external_write"]),
                webhook_url: z.string().url().optional(),
              }),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Job created",
        content: { "application/json": { schema: z.object({ job: z.record(z.unknown()) }) } },
      },
    },
  });

  app.openapi(createJobRoute, async (c) => {
    const auth = getAuth(c);
    const { session_id } = c.req.valid("param");
    await assertSessionOwner(session_id, auth.clientId);
    const body = c.req.valid("json");
    const [job] = await schedulerDb.db
      .insert(sessionJobs)
      .values({
        sessionId: session_id,
        clientId: auth.clientId,
        everySeconds: body.every_seconds,
        task: body.task,
        outputRouting: body.output_routing,
      })
      .returning();
    return c.json(
      {
        job: {
          id: job!.id,
          session_id,
          every_seconds: job!.everySeconds,
          output_routing: job!.outputRouting,
          enabled: job!.enabled,
        },
      },
      201,
    );
  });

  return app;
}

export function startSchedulerTick(
  schedulerDb: SchedulerDb,
  onJob: (job: typeof sessionJobs.$inferSelect) => Promise<void>,
) {
  setInterval(async () => {
    const jobs = await schedulerDb.db.select().from(sessionJobs);
    const now = Date.now();
    for (const job of jobs) {
      if (!job.enabled) continue;
      const last = job.lastRunAt?.getTime() ?? 0;
      if (now - last < job.everySeconds * 1000) continue;
      await onJob(job);
      await schedulerDb.db
        .update(sessionJobs)
        .set({ lastRunAt: new Date() })
        .where(eq(sessionJobs.id, job.id));
    }
  }, 5_000);
}
