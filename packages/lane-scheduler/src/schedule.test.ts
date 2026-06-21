import { describe, expect, it } from "vitest";
import {
  computeNextCronRun,
  isJobDue,
  validateScheduleInput,
} from "./schedule.js";

describe("validateScheduleInput", () => {
  it("accepts every_seconds", () => {
    expect(validateScheduleInput({ every_seconds: 60 })).toEqual({
      everySeconds: 60,
      cron: null,
    });
  });

  it("accepts cron", () => {
    expect(validateScheduleInput({ cron: "0 * * * *" })).toEqual({
      everySeconds: null,
      cron: "0 * * * *",
    });
  });

  it("rejects both", () => {
    expect(() =>
      validateScheduleInput({ every_seconds: 60, cron: "0 * * * *" }),
    ).toThrow(/exactly one/);
  });
});

describe("computeNextCronRun", () => {
  it("returns a future instant", () => {
    const from = new Date("2026-06-21T12:30:00Z");
    const next = computeNextCronRun("0 * * * *", from);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
  });
});

describe("isJobDue", () => {
  it("every_seconds due after interval", () => {
    const now = new Date("2026-06-21T12:00:10Z");
    expect(
      isJobDue(
        {
          everySeconds: 60,
          cron: null,
          nextRunAt: null,
          lastRunAt: new Date("2026-06-21T11:59:00Z"),
          createdAt: new Date("2026-06-21T11:00:00Z"),
        },
        now,
      ),
    ).toBe(true);
  });

  it("cron due when next_run_at passed", () => {
    const now = new Date("2026-06-21T12:05:00Z");
    expect(
      isJobDue(
        {
          everySeconds: null,
          cron: "0 * * * *",
          nextRunAt: new Date("2026-06-21T12:00:00Z"),
          lastRunAt: null,
          createdAt: new Date("2026-06-21T11:00:00Z"),
        },
        now,
      ),
    ).toBe(true);
  });
});
