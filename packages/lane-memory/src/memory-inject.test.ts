import { describe, expect, it } from "vitest";
import { resolveHarnessMemoryInject } from "./memory-inject.js";

describe("resolveHarnessMemoryInject", () => {
  it("prefers validated memory_inject over application.memory_keys", () => {
    const config = resolveHarnessMemoryInject({
      memory_inject: { memory_keys: ["a"] },
      application: { memory_keys: ["b"] },
    });
    expect(config?.memory_keys).toEqual(["a"]);
  });

  it("falls back to application.memory_keys for legacy templates", () => {
    const config = resolveHarnessMemoryInject({
      application: {
        memory_keys: ["editorial/feedback", "editorial/backlog"],
      },
    });
    expect(config?.memory_keys).toEqual(["editorial/feedback", "editorial/backlog"]);
  });

  it("returns undefined when no inject config exists", () => {
    expect(resolveHarnessMemoryInject({})).toBeUndefined();
    expect(resolveHarnessMemoryInject({ application: { memory_keys: [] } })).toBeUndefined();
  });
});
