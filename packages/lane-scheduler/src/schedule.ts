import { CronExpressionParser } from "cron-parser";
import { badRequest } from "@orbita/platform";

export type SessionJobSchedule = {
  everySeconds: number | null;
  cron: string | null;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  createdAt: Date;
};

export function computeNextCronRun(cron: string, from: Date): Date {
  const expr = CronExpressionParser.parse(cron, { currentDate: from });
  return expr.next().toDate();
}

export function isJobDue(job: SessionJobSchedule, now: Date): boolean {
  const nowMs = now.getTime();
  if (job.cron) {
    if (!job.nextRunAt) {
      return true;
    }
    return nowMs >= job.nextRunAt.getTime();
  }
  if (job.everySeconds != null && job.everySeconds > 0) {
    const last = job.lastRunAt?.getTime() ?? 0;
    return nowMs - last >= job.everySeconds * 1000;
  }
  return false;
}

export function validateScheduleInput(input: {
  every_seconds?: number;
  cron?: string;
}): { everySeconds: number | null; cron: string | null } {
  const hasEvery = input.every_seconds !== undefined;
  const hasCron = input.cron !== undefined && input.cron.trim().length > 0;

  if (hasEvery && hasCron) {
    throw badRequest("Provide exactly one of every_seconds or cron");
  }
  if (!hasEvery && !hasCron) {
    throw badRequest("Provide exactly one of every_seconds or cron");
  }

  if (hasCron) {
    const cron = input.cron!.trim();
    try {
      CronExpressionParser.parse(cron);
    } catch {
      throw badRequest("Invalid cron expression", { cron });
    }
    return { everySeconds: null, cron };
  }

  const everySeconds = input.every_seconds!;
  if (!Number.isInteger(everySeconds) || everySeconds <= 0) {
    throw badRequest("every_seconds must be a positive integer");
  }
  return { everySeconds, cron: null };
}

export function initialNextRunAt(
  cron: string | null,
  from: Date,
): Date | null {
  if (!cron) return null;
  return computeNextCronRun(cron, from);
}
