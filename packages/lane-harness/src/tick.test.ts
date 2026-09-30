import { afterEach, describe, expect, it, vi } from "vitest";
import { computeNextCronRun } from "@orbita/scheduler";
import type { AgentTurnRunner, SessionsDb } from "@orbita/sessions";
import type { HarnessDb } from "./db/client.js";
import { harnessRuns, harnesses } from "./db/schema.js";
import {
  executeHarnessRun,
  startHarnessTick,
  type HarnessRunDeps,
  type SystemCollectorRunner,
} from "./tick.js";
import type { HarnessConfig } from "./types.js";

const CRON = "0 6 * * *";

type UpdateCall = { table: unknown; values: Record<string, unknown> };

function harnessRow(nextRunAt: Date) {
  const config: HarnessConfig = {
    session_policy: "sticky",
    loops: {
      agent: {
        enabled: true,
        profile_id: "personal",
        task: { mode: "message", message: "collect" },
      },
      verify: { enabled: false },
      trigger: { enabled: true, cron: CRON, timezone: "UTC" },
      improve: { enabled: false },
    },
    output: { mode: "poll", emit_trajectory: true },
    application: { collector: "portfolio_git" },
  };
  return {
    id: "c46c8213-308b-4391-abfe-f00eb037d4b6",
    clientId: "personal-jacky",
    name: "portfolio-git-collect",
    templateId: "portfolio-git-collect@v1",
    templateVersion: "1",
    configVersion: "1",
    config,
    sessionId: "11111111-1111-4111-8111-111111111111",
    cron: CRON,
    timezone: "UTC",
    nextRunAt,
    lastRunAt: new Date("2026-09-02T06:00:00.000Z"),
    sessionMemoryKey: null,
    feedbackMemoryKey: null,
    enabled: true,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: nextRunAt,
  };
}

function createFakeDb(opts: {
  harnessRows?: ReturnType<typeof harnessRow>[];
  existingRuns?: Array<{ id: string; status: string; error: string | null }>;
}) {
  const updates: UpdateCall[] = [];
  const inserts: Array<Record<string, unknown>> = [];
  let seq = 0;
  const db = {
    select: () => ({
      from: (table: unknown) => {
        const rows =
          table === harnesses
            ? (opts.harnessRows ?? [])
            : table === harnessRuns
              ? (opts.existingRuns ?? [])
              : [];
        const promise = Promise.resolve(rows);
        return {
          where: () => promise,
          then: (
            onFulfilled: (value: typeof rows) => unknown,
            onRejected?: (reason: unknown) => unknown,
          ) => promise.then(onFulfilled, onRejected),
        };
      },
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          inserts.push(values);
          seq += 1;
          return [{ id: `run-${seq}` }];
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          updates.push({ table, values });
        },
      }),
    }),
  };
  return {
    harnessDb: { db } as unknown as HarnessDb,
    updates,
    inserts,
  };
}

function deps(runner: SystemCollectorRunner): HarnessRunDeps {
  return {
    memoryDb: {} as HarnessRunDeps["memoryDb"],
    memoryEnv: {} as HarnessRunDeps["memoryEnv"],
    systemCollectors: { portfolio_git: runner },
  };
}

const sessionsDb = {} as SessionsDb;
const runTurn = vi.fn() as unknown as AgentTurnRunner;

function harnessScheduleUpdate(updates: UpdateCall[]) {
  return updates.filter((call) => call.table === harnesses);
}

function runStatusUpdate(updates: UpdateCall[]) {
  return updates.find((call) => call.table === harnessRuns && call.values.status);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("executeHarnessRun cron schedule", () => {
  it("marks the run failed and advances nextRunAt when the collector returns ok:false", async () => {
    const dueAt = new Date("2026-09-03T06:00:00.000Z");
    const row = harnessRow(dueAt);
    const { harnessDb, updates, inserts } = createFakeDb({});
    const runner = vi.fn(async () => ({ ok: false, error: "repo scan failed" }));

    const result = await executeHarnessRun(
      harnessDb,
      sessionsDb,
      row,
      "cron",
      dueAt,
      runTurn,
      deps(runner),
    );

    expect(result).toEqual({ ran: false, runId: "run-1", error: "repo scan failed" });
    expect(runner).toHaveBeenCalledOnce();
    expect(inserts).toHaveLength(1);
    expect(runStatusUpdate(updates)?.values).toMatchObject({
      status: "failed",
      error: "repo scan failed",
    });
    const [schedule] = harnessScheduleUpdate(updates);
    expect(schedule?.values.lastRunAt).toBeUndefined();
    expect(schedule?.values.nextRunAt).toEqual(
      computeNextCronRun(CRON, schedule!.values.updatedAt as Date),
    );
  });

  it("marks the run failed and advances nextRunAt when the collector throws", async () => {
    const dueAt = new Date("2026-09-03T06:00:00.000Z");
    const row = harnessRow(dueAt);
    const { harnessDb, updates } = createFakeDb({});
    const runner = vi.fn(async () => {
      throw new Error("collector exploded");
    });

    const result = await executeHarnessRun(
      harnessDb,
      sessionsDb,
      row,
      "cron",
      dueAt,
      runTurn,
      deps(runner),
    );

    expect(result).toEqual({ ran: false, runId: "run-1", error: "collector exploded" });
    expect(runner).toHaveBeenCalledOnce();
    expect(runStatusUpdate(updates)?.values).toMatchObject({
      status: "failed",
      error: "collector exploded",
    });
    const [schedule] = harnessScheduleUpdate(updates);
    expect(schedule?.values.lastRunAt).toBeUndefined();
    expect(schedule?.values.nextRunAt).toEqual(
      computeNextCronRun(CRON, schedule!.values.updatedAt as Date),
    );
  });

  it("advances a wedged slot and warns without calling the runner again", async () => {
    const dueAt = new Date("2026-09-03T06:00:00.000Z");
    const row = harnessRow(dueAt);
    const { harnessDb, updates, inserts } = createFakeDb({
      harnessRows: [row],
      existingRuns: [{ id: "run-old", status: "failed", error: "git failed" }],
    });
    const runner = vi.fn(async () => ({ ok: true }));
    let queued: (() => Promise<void>) | undefined;
    vi.spyOn(globalThis, "setInterval").mockImplementation((handler) => {
      queued = handler as () => Promise<void>;
      return 0 as unknown as ReturnType<typeof setInterval>;
    });
    const logger = { info: vi.fn(), warn: vi.fn() };

    startHarnessTick(harnessDb, sessionsDb, runTurn, deps(runner), undefined, logger);
    await queued!();

    expect(runner).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
    const [schedule] = harnessScheduleUpdate(updates);
    expect(schedule?.values.lastRunAt).toBeUndefined();
    const nextRunAt = schedule?.values.nextRunAt as Date;
    expect(nextRunAt.getTime()).toBeGreaterThan(dueAt.getTime());
    expect(nextRunAt).toEqual(computeNextCronRun(CRON, schedule!.values.updatedAt as Date));
    expect(logger.warn).toHaveBeenCalledWith(
      {
        harness_id: row.id,
        status: "failed",
        error: "git failed",
      },
      "harness run skipped: already attempted for this slot; advanced next_run_at",
    );
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.anything(),
      "harness run failed",
    );
  });

  it("still records lastRunAt and the next slot when the collector succeeds", async () => {
    const dueAt = new Date("2026-09-03T06:00:00.000Z");
    const row = harnessRow(dueAt);
    const { harnessDb, updates } = createFakeDb({});
    const runner = vi.fn(async () => ({ ok: true, detail: "wrote note" }));

    const result = await executeHarnessRun(
      harnessDb,
      sessionsDb,
      row,
      "cron",
      dueAt,
      runTurn,
      deps(runner),
    );

    expect(result).toEqual({ ran: true, runId: "run-1" });
    expect(runner).toHaveBeenCalledOnce();
    expect(runStatusUpdate(updates)?.values).toMatchObject({ status: "completed" });
    const [schedule] = harnessScheduleUpdate(updates);
    const lastRunAt = schedule?.values.lastRunAt as Date;
    expect(lastRunAt).toBeInstanceOf(Date);
    expect(schedule?.values.updatedAt).toBe(lastRunAt);
    expect(schedule?.values.nextRunAt).toEqual(computeNextCronRun(CRON, lastRunAt));
  });
});
