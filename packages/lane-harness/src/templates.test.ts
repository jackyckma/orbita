import { describe, expect, it } from "vitest";
import {
  deepMerge,
  getHarnessTemplate,
  mergeHarnessConfig,
  refreshEditorialRunDates,
} from "./templates.js";

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
    expect(config.session_policy).toBe("per_run");
    expect(config.loops.agent.profile_id).toBe("at-editorial");
    expect(config.loops.trigger.cron).toBe("0 7 * * *");
    expect(config.loops.agent.task.message).toBe("Daily run override");
    expect(config.loops.verify.enabled).toBe(false);
  });

  it("accepts @vN version suffix from templatePublicId", () => {
    expect(getHarnessTemplate("editorial-supply@v1").id).toBe("editorial-supply");
    expect(getHarnessTemplate("editorial-supply@1").id).toBe("editorial-supply");
  });

  it("refreshes stale daily run dates for editorial-supply prompts", () => {
    const prompt =
      "# Series brief\n\n---\n\n# Daily run (2026-06-28 UTC)\n\nBatch 2026-06-28 → drafts/org/daily/2026-06-28";
    const dueAt = new Date("2026-06-29T07:00:02.981Z");
    const out = refreshEditorialRunDates(prompt, dueAt);
    expect(out).toContain("# Daily run (2026-06-29 UTC)");
    expect(out).not.toContain("2026-06-28");
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
