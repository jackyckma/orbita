import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { badRequest, notFound } from "@orbita/platform";
import type { HarnessConfig, HarnessTemplate } from "./types.js";
import { harnessConfigSchema } from "./types.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const templatesDir = join(moduleDir, "..", "templates");

function loadTemplateFile(id: string): HarnessTemplate {
  const path = join(templatesDir, `${id}.json`);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as HarnessTemplate;
  } catch {
    throw notFound(`Harness template not found: ${id}`);
  }
}

export function listHarnessTemplates(): HarnessTemplate[] {
  return readdirSync(templatesDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => loadTemplateFile(name.replace(/\.json$/, "")));
}

function normalizeTemplateVersion(versionPart: string): string {
  return versionPart.replace(/^v/i, "");
}

export function getHarnessTemplate(templateRef: string): HarnessTemplate {
  const [id, versionPart] = templateRef.split("@");
  if (!id) throw notFound(`Harness template not found: ${templateRef}`);
  const base = loadTemplateFile(id);
  if (
    versionPart &&
    String(base.version) !== normalizeTemplateVersion(versionPart)
  ) {
    throw notFound(`Harness template version not found: ${templateRef}`);
  }
  if (base.extends) {
    const parent = loadTemplateFile(base.extends);
    return {
      ...base,
      defaults: deepMerge(parent.defaults, base.defaults),
    };
  }
  return base;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key] as Record<string, unknown>, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function mergeHarnessConfig(
  templateRef: string,
  overrides?: Record<string, unknown>,
): { template: HarnessTemplate; config: HarnessConfig } {
  const template = getHarnessTemplate(templateRef);
  const merged = deepMerge(template.defaults, overrides ?? {});
  const parsed = harnessConfigSchema.safeParse(merged);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Invalid harness config");
  }
  if (!parsed.data.loops.agent.enabled) {
    throw badRequest("loops.agent must be enabled for H1 harnesses");
  }
  if (parsed.data.loops.verify.enabled || parsed.data.loops.improve.enabled) {
    throw badRequest("Loop 2 verify and Loop 4 improve are not enabled in H1");
  }
  if (!parsed.data.loops.trigger.enabled || !parsed.data.loops.trigger.cron) {
    throw badRequest("loops.trigger.cron is required when trigger is enabled");
  }
  return { template, config: parsed.data };
}

export function refreshEditorialRunDates(message: string, dueAt: Date): string {
  const today = dueAt.toISOString().slice(0, 10);
  const marker = "# Daily run (";
  const idx = message.indexOf(marker);
  if (idx === -1) return message;

  const before = message.slice(0, idx);
  const after = message.slice(idx);
  const staleMatch = after.match(/# Daily run \((\d{4}-\d{2}-\d{2}) UTC\)/);
  if (!staleMatch) return message;

  const stale = staleMatch[1];
  if (!stale || stale === today) return message;

  const refreshedAfter = after.split(stale).join(today);
  return (
    before +
    refreshedAfter.replace(
      /# Daily run \(\d{4}-\d{2}-\d{2} UTC\)/,
      `# Daily run (${today} UTC)`,
    )
  );
}

export function resolveHarnessRunMessage(
  config: HarnessConfig,
  options?: { templateId?: string; dueAt?: Date },
): string {
  let message = resolveAgentMessage(config);
  if (options?.templateId === "editorial-supply" && options.dueAt) {
    message = refreshEditorialRunDates(message, options.dueAt);
  }
  return message;
}

export function resolveAgentMessage(config: HarnessConfig): string {
  const task = config.loops.agent.task;
  if (task.mode === "message") {
    const text = (task.message ?? "").trim();
    if (!text) throw badRequest("loops.agent.task.message is required");
    return text;
  }
  throw badRequest("prompt_ref task mode is not supported in H1 — pass composed message override");
}

export function templatePublicId(template: HarnessTemplate): string {
  return `${template.id}@v${template.version}`;
}
