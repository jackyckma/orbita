import { resolveHarnessMemoryInject, type MemoryInjectConfig } from "@orbita/memory";
import { getHarnessTemplate } from "./templates.js";
import type { HarnessConfig } from "./types.js";

export function resolveHarnessMemoryInjectForRun(
  harness: { config: unknown; templateId: string },
): MemoryInjectConfig | undefined {
  const config = harness.config as HarnessConfig;
  const fromConfig = resolveHarnessMemoryInject(config);
  if (fromConfig) return fromConfig;

  try {
    const template = getHarnessTemplate(harness.templateId);
    return resolveHarnessMemoryInject({
      memory_inject: config.memory_inject,
      application: template.application,
    });
  } catch {
    return undefined;
  }
}
