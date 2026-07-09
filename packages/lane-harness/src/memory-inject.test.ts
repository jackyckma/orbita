import { describe, expect, it } from "vitest";
import { resolveHarnessMemoryInjectForRun } from "./memory-inject.js";

describe("resolveHarnessMemoryInjectForRun", () => {
  it("reads memory_inject from stored harness config", () => {
    const config = resolveHarnessMemoryInjectForRun({
      templateId: "cron-agent",
      config: {
        memory_inject: { memory_keys: ["a"] },
      },
    });
    expect(config?.memory_keys).toEqual(["a"]);
  });

  it("falls back to template application for legacy harness rows", () => {
    const config = resolveHarnessMemoryInjectForRun({
      templateId: "editorial-supply@v1",
      config: {
        session_policy: "per_run",
        loops: {
          agent: {
            enabled: true,
            profile_id: "at-editorial",
            task: { mode: "message", message: "run" },
          },
          verify: { enabled: false },
          trigger: { enabled: true, cron: "0 7 * * *", timezone: "UTC" },
          improve: { enabled: false },
        },
        output: { mode: "poll", emit_trajectory: true },
      },
    });
    expect(config?.memory_keys).toContain("editorial/feedback");
  });
});
