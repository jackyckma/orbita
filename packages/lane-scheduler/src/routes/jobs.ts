import { eq } from "drizzle-orm";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { badRequest } from "@orbita/platform";
import { getAuth, requireScope } from "@orbita/auth";
import type { SchedulerDb } from "../db/client.js";
import { sessionJobs } from "../db/schema.js";
import {
  computeNextCronRun,
  initialNextRunAt,
  isJobDue,
  validateScheduleInput,
} from "../schedule.js";
import { deliverJobWebhook } from "../webhook.js";

const scheduleSchema = z
  .object({
    every_seconds: z.number().int().positive().optional(),
    cron: z.string().min(1).optional(),
    task: z.record(z.unknown()),
    output_routing: z.object({
      mode: z.enum(["poll", "webhook", "external_write"]),
      webhook_url: z.string().url().optional(),
    }),
  })
  .refine(
    (body) => {
      const hasEvery = body.every_seconds !== undefined;
      const hasCron = body.cron !== undefined;
      return hasEvery !== hasCron;
    },
    { message: "Provide exactly one of every_seconds or cron" },
  );

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
            schema: scheduleSchema,
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

    if (body.output_routing.mode === "webhook" && !body.output_routing.webhook_url) {
      throw badRequest("webhook_url is required when output_routing.mode is webhook");
    }

    const schedule = validateScheduleInput({
      every_seconds: body.every_seconds,
      cron: body.cron,
    });
    const createdAt = new Date();
    const nextRunAt = initialNextRunAt(schedule.cron, createdAt);

    const [job] = await schedulerDb.db
      .insert(sessionJobs)
      .values({
        sessionId: session_id,
        clientId: auth.clientId,
        everySeconds: schedule.everySeconds,
        cron: schedule.cron,
        nextRunAt,
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
          cron: job!.cron,
          next_run_at: job!.nextRunAt?.toISOString() ?? null,
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
  logger?: { warn: (obj: object, msg: string) => void },
) {
  setInterval(async () => {
    const jobs = await schedulerDb.db.select().from(sessionJobs);
    const now = new Date();
    for (const job of jobs) {
      if (!job.enabled) continue;
      if (
        !isJobDue(
          {
            everySeconds: job.everySeconds,
            cron: job.cron,
            nextRunAt: job.nextRunAt,
            lastRunAt: job.lastRunAt,
            createdAt: job.createdAt,
          },
          now,
        )
      ) {
        continue;
      }

      await onJob(job);

      const delivery = await deliverJobWebhook(job, {
        job_id: job.id,
        session_id: job.sessionId,
        client_id: job.clientId,
        task: job.task,
        timestamp: now.toISOString(),
      });
      if (!delivery.ok && logger) {
        logger.warn({ job_id: job.id, delivery }, "webhook delivery failed");
      }

      const updates: {
        lastRunAt: Date;
        nextRunAt?: Date;
      } = { lastRunAt: now };
      if (job.cron) {
        updates.nextRunAt = computeNextCronRun(job.cron, now);
      }

      await schedulerDb.db
        .update(sessionJobs)
        .set(updates)
        .where(eq(sessionJobs.id, job.id));
    }
  }, 5_000);
}
