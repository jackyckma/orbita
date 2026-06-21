import { describe, expect, it } from "vitest";
import { validateScheduleInput } from "../../packages/lane-scheduler/src/schedule.js";

describe("e2e tier A — scheduler contracts", () => {
  it("rejects ambiguous schedule input", () => {
    expect(() =>
      validateScheduleInput({ every_seconds: 30, cron: "0 * * * *" }),
    ).toThrow();
  });
});
