import { CronExpressionParser } from "cron-parser";
import { sessionJobs } from "./db/schema.js";

type SessionJob = typeof sessionJobs.$inferSelect;

export type JobScheduleInput = {
  every_seconds?: number;
  cron?: string;
};

export type SchedulerTimingJob = Pick<
  SessionJob,
  "everySeconds" | "cron" | "nextRunAt" | "lastRunAt" | "createdAt"
>;

export type JobForDelivery = Pick<SessionJob, "id" | "sessionId" | "task" | "outputRouting">;

export type JobDeliveryResult = {
  mode: SessionJob["outputRouting"]["mode"];
  delivered: boolean;
  ok: boolean;
  status?: number;
  error?: string;
};

type LoggerLike = Pick<Console, "info" | "error">;

export function hasExactlyOneScheduleField(input: JobScheduleInput): boolean {
  const hasEverySeconds = typeof input.every_seconds === "number";
  const hasCron = typeof input.cron === "string";
  return Number(hasEverySeconds) + Number(hasCron) === 1;
}

export function computeNextRun(cron: string, from: Date): Date {
  const parsed = CronExpressionParser.parse(cron, { currentDate: from });
  return parsed.next().toDate();
}

export function resolveNextRunAt(job: SchedulerTimingJob): Date | null {
  if (!job.cron) {
    return null;
  }
  return job.nextRunAt ?? computeNextRun(job.cron, job.createdAt);
}

export function isJobDue(job: SchedulerTimingJob, now: Date): boolean {
  if (job.cron) {
    const nextRunAt = resolveNextRunAt(job);
    return nextRunAt !== null && now.getTime() >= nextRunAt.getTime();
  }
  if (typeof job.everySeconds !== "number") {
    return false;
  }
  const lastRun = job.lastRunAt?.getTime() ?? 0;
  return now.getTime() - lastRun >= job.everySeconds * 1000;
}

export async function deliverJobOutput(
  job: JobForDelivery,
  payload: Record<string, unknown>,
  options?: {
    fetchImpl?: typeof fetch;
    logger?: LoggerLike;
    now?: Date;
  },
): Promise<JobDeliveryResult> {
  const logger = options?.logger ?? console;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const timestamp = (options?.now ?? new Date()).toISOString();

  if (job.outputRouting.mode === "poll") {
    return { mode: "poll", delivered: false, ok: true };
  }

  if (job.outputRouting.mode === "external_write") {
    logger.info({ job_id: job.id }, "external_write output delivery is not implemented");
    return { mode: "external_write", delivered: false, ok: true };
  }

  const webhookUrl = job.outputRouting.webhook_url;
  if (!webhookUrl) {
    const error = "Missing webhook_url for webhook output routing";
    logger.error({ job_id: job.id }, error);
    return { mode: "webhook", delivered: true, ok: false, error };
  }

  try {
    const response = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        job_id: job.id,
        session_id: job.sessionId,
        task: job.task,
        timestamp,
        payload,
      }),
    });
    if (!response.ok) {
      const error = `Webhook delivery failed with status ${response.status}`;
      logger.error({ job_id: job.id, status: response.status }, error);
      return {
        mode: "webhook",
        delivered: true,
        ok: false,
        status: response.status,
        error,
      };
    }
    return {
      mode: "webhook",
      delivered: true,
      ok: true,
      status: response.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ job_id: job.id, error: message }, "Webhook delivery threw an error");
    return { mode: "webhook", delivered: true, ok: false, error: message };
  }
}
