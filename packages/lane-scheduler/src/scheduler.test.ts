import { describe, expect, it, vi } from "vitest";
import type { OrbitaError } from "@orbita/platform";
import { validateCreateJobBody } from "./routes/jobs.js";
import {
  computeNextRun,
  deliverJobOutput,
  hasExactlyOneScheduleField,
  isJobDue,
  resolveNextRunAt,
  type SchedulerTimingJob,
} from "./scheduler.js";

describe("scheduler", () => {
  it("computes the next cron run from a fixed date", () => {
    const from = new Date("2026-01-01T00:01:30.000Z");
    const next = computeNextRun("0 */5 * * * *", from);
    expect(next.toISOString()).toBe("2026-01-01T00:05:00.000Z");
  });

  it("checks exactly-one schedule field", () => {
    expect(hasExactlyOneScheduleField({ every_seconds: 30 })).toBe(true);
    expect(hasExactlyOneScheduleField({ cron: "0 * * * * *" })).toBe(true);
    expect(hasExactlyOneScheduleField({ every_seconds: 30, cron: "0 * * * * *" })).toBe(false);
    expect(hasExactlyOneScheduleField({})).toBe(false);
  });

  it("rejects invalid create-job payload combinations", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");

    expect(() =>
      validateCreateJobBody(
        {
          task: { type: "demo" },
          output_routing: { mode: "poll" },
        },
        createdAt,
      ),
    ).toThrowError(/Exactly one of every_seconds or cron is required/);

    expect(() =>
      validateCreateJobBody(
        {
          every_seconds: 30,
          cron: "0 * * * * *",
          task: { type: "demo" },
          output_routing: { mode: "poll" },
        },
        createdAt,
      ),
    ).toThrowError(/Exactly one of every_seconds or cron is required/);

    try {
      validateCreateJobBody(
        {
          cron: "not-a-cron",
          task: { type: "demo" },
          output_routing: { mode: "poll" },
        },
        createdAt,
      );
    } catch (error) {
      const orbitaError = error as OrbitaError;
      expect(orbitaError.code).toBe("bad_request");
      expect(orbitaError.message).toBe("Invalid cron expression");
    }

    expect(() =>
      validateCreateJobBody(
        {
          cron: "0 * * * * *",
          task: { type: "demo" },
          output_routing: { mode: "webhook" },
        },
        createdAt,
      ),
    ).toThrowError(/webhook_url is required/);
  });

  it("computes due-ness for every_seconds jobs", () => {
    const base = new Date("2026-01-01T00:00:10.000Z");
    const job: SchedulerTimingJob = {
      everySeconds: 10,
      cron: null,
      nextRunAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      lastRunAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    expect(isJobDue(job, base)).toBe(true);
    expect(isJobDue({ ...job, lastRunAt: new Date("2026-01-01T00:00:05.000Z") }, base)).toBe(
      false,
    );
  });

  it("computes due-ness for cron jobs and derives next_run_at when missing", () => {
    const cronJob: SchedulerTimingJob = {
      everySeconds: null,
      cron: "0 */5 * * * *",
      nextRunAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      lastRunAt: null,
    };

    const derived = resolveNextRunAt(cronJob);
    expect(derived?.toISOString()).toBe("2026-01-01T00:05:00.000Z");
    expect(isJobDue(cronJob, new Date("2026-01-01T00:04:59.000Z"))).toBe(false);
    expect(isJobDue(cronJob, new Date("2026-01-01T00:05:00.000Z"))).toBe(true);
  });

  it("posts webhook payload to caller-provided URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("ok", { status: 202 }));
    const result = await deliverJobOutput(
      {
        id: "job-1",
        sessionId: "session-1",
        task: { action: "sync" },
        outputRouting: { mode: "webhook", webhook_url: "https://example.com/hook" },
      },
      { output: { status: "done" } },
      { fetchImpl, now: new Date("2026-01-01T00:00:00.000Z") },
    );

    expect(result).toEqual({
      mode: "webhook",
      delivered: true,
      ok: true,
      status: 202,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, request] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://example.com/hook");
    expect(request.method).toBe("POST");
    const body = JSON.parse(request.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      job_id: "job-1",
      session_id: "session-1",
      task: { action: "sync" },
      timestamp: "2026-01-01T00:00:00.000Z",
      payload: { output: { status: "done" } },
    });
  });

  it("swallows webhook non-2xx responses and thrown errors", async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const failingStatus = await deliverJobOutput(
      {
        id: "job-2",
        sessionId: "session-2",
        task: { action: "sync" },
        outputRouting: { mode: "webhook", webhook_url: "https://example.com/hook" },
      },
      {},
      {
        fetchImpl: vi.fn().mockResolvedValue(new Response("bad", { status: 500 })),
        logger,
      },
    );
    expect(failingStatus.ok).toBe(false);
    expect(failingStatus.status).toBe(500);

    const thrown = await deliverJobOutput(
      {
        id: "job-3",
        sessionId: "session-3",
        task: { action: "sync" },
        outputRouting: { mode: "webhook", webhook_url: "https://example.com/hook" },
      },
      {},
      {
        fetchImpl: vi.fn().mockRejectedValue(new Error("network down")),
        logger,
      },
    );
    expect(thrown.ok).toBe(false);
    expect(thrown.error).toContain("network down");
    expect(logger.error).toHaveBeenCalled();
  });
});
