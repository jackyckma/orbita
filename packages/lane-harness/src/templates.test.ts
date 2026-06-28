import { describe, expect, it } from "vitest";
import { deepMerge, mergeHarnessConfig } from "./templates.js";

describe("harness templates", () => {
  it("merges editorial-supply onto cron-agent", () => {
    const { template, config } = mergeHarnessConfig("editorial-supply", {
      name: "test",
      loops: {
        agent: {
          task: { mode: "message", message: "Daily run override" },
        },
      },
    });
    expect(template.id).toBe("editorial-supply");
    expect(config.loops.agent.profile_id).toBe("at-editorial");
    expect(config.loops.trigger.cron).toBe("0 7 * * *");
    expect(config.loops.agent.task.message).toBe("Daily run override");
    expect(config.loops.verify.enabled).toBe(false);
  });

  it("deep merges nested loops", () => {
    const merged = deepMerge(
      { loops: { agent: { profile_id: "default" }, trigger: { cron: "0 9 * * *" } } },
      { loops: { agent: { profile_id: "research" } } },
    );
    expect(merged).toEqual({
      loops: { agent: { profile_id: "research" }, trigger: { cron: "0 9 * * *" } },
    });
  });
});
