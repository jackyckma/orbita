import { eq } from "drizzle-orm";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getAuth, requireScope } from "@orbita/auth";
import { badRequest } from "@orbita/platform";
import type { SchedulerDb } from "../db/client.js";
import { sessionJobs } from "../db/schema.js";
import {
  computeNextRun,
  hasExactlyOneScheduleField,
  isJobDue,
  resolveNextRunAt,
} from "../scheduler.js";

type CreateJobBody = {
  every_seconds?: number;
  cron?: string;
  task: Record<string, unknown>;
  output_routing: {
    mode: "poll" | "webhook" | "external_write";
    webhook_url?: string;
  };
};

export function validateCreateJobBody(body: CreateJobBody, createdAt: Date) {
  if (!hasExactlyOneScheduleField(body)) {
    throw badRequest("Exactly one of every_seconds or cron is required");
  }

  if (body.output_routing.mode === "webhook" && !body.output_routing.webhook_url) {
    throw badRequest("webhook_url is required when output_routing.mode is webhook");
  }

  if (typeof body.cron === "string") {
    try {
      return {
        everySeconds: null,
        cron: body.cron,
        nextRunAt: computeNextRun(body.cron, createdAt),
      };
    } catch {
      throw badRequest("Invalid cron expression", { cron: body.cron });
    }
  }

  return {
    everySeconds: body.every_seconds ?? null,
    cron: null,
    nextRunAt: null,
  };
}

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
              every_seconds: z.number().int().positive().optional(),
              cron: z.string().optional(),
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
    const createdAt = new Date();
    const schedule = validateCreateJobBody(body, createdAt);

    const [job] = await schedulerDb.db
      .insert(sessionJobs)
      .values({
        sessionId: session_id,
        clientId: auth.clientId,
        everySeconds: schedule.everySeconds,
        cron: schedule.cron,
        nextRunAt: schedule.nextRunAt,
        task: body.task,
        outputRouting: body.output_routing,
        createdAt,
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
) {
  setInterval(async () => {
    const jobs = await schedulerDb.db.select().from(sessionJobs);
    const now = new Date();
    for (const job of jobs) {
      if (!job.enabled) continue;
      try {
        let currentJob = job;
        if (currentJob.cron && !currentJob.nextRunAt) {
          const firstRunAt = resolveNextRunAt(currentJob);
          if (firstRunAt) {
            await schedulerDb.db
              .update(sessionJobs)
              .set({ nextRunAt: firstRunAt })
              .where(eq(sessionJobs.id, currentJob.id));
            currentJob = { ...currentJob, nextRunAt: firstRunAt };
          }
        }

        if (!isJobDue(currentJob, now)) continue;
        await onJob(currentJob);

        if (currentJob.cron) {
          const nextRunAt = computeNextRun(currentJob.cron, now);
          await schedulerDb.db
            .update(sessionJobs)
            .set({ lastRunAt: now, nextRunAt })
            .where(eq(sessionJobs.id, currentJob.id));
          continue;
        }

        await schedulerDb.db
          .update(sessionJobs)
          .set({ lastRunAt: now })
          .where(eq(sessionJobs.id, currentJob.id));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error({ job_id: job.id, error: message }, "scheduler tick failed");
      }
    }
  }, 5_000);
}
