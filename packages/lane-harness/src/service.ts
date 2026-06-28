import { and, desc, eq } from "drizzle-orm";
import { initialNextRunAt } from "@orbita/scheduler";
import { badRequest, notFound } from "@orbita/platform";
import type { MemoryDb } from "@orbita/memory";
import { getMemoryByKey, upsertMemory } from "@orbita/memory";
import type { MemoryEnv } from "@orbita/memory";
import { createSession } from "@orbita/sessions";
import type { SessionsDb } from "@orbita/sessions";
import type { HarnessDb } from "./db/client.js";
import { harnessRuns, harnesses } from "./db/schema.js";
import {
  mergeHarnessConfig,
  resolveAgentMessage,
  templatePublicId,
} from "./templates.js";
import type { HarnessConfig } from "./types.js";

function rowToJson(row: typeof harnesses.$inferSelect) {
  return {
    id: row.id,
    client_id: row.clientId,
    name: row.name,
    template_id: row.templateId,
    template_version: row.templateVersion,
    config_version: row.configVersion,
    config: row.config,
    session_id: row.sessionId,
    cron: row.cron,
    timezone: row.timezone,
    next_run_at: row.nextRunAt?.toISOString() ?? null,
    last_run_at: row.lastRunAt?.toISOString() ?? null,
    session_memory_key: row.sessionMemoryKey,
    feedback_memory_key: row.feedbackMemoryKey,
    enabled: row.enabled,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function runToJson(row: typeof harnessRuns.$inferSelect) {
  return {
    id: row.id,
    harness_id: row.harnessId,
    client_id: row.clientId,
    session_id: row.sessionId,
    status: row.status,
    trigger: row.trigger,
    cron_fingerprint: row.cronFingerprint,
    error: row.error,
    started_at: row.startedAt.toISOString(),
    finished_at: row.finishedAt?.toISOString() ?? null,
  };
}

export async function createHarnessRecord(
  harnessDb: HarnessDb,
  sessionsDb: SessionsDb,
  memoryDb: MemoryDb,
  memoryEnv: MemoryEnv,
  clientId: string,
  input: { template_id: string; name: string; overrides?: Record<string, unknown> },
) {
  const { template, config } = mergeHarnessConfig(input.template_id, input.overrides);
  const profileId = config.loops.agent.profile_id;
  const session = await createSession(sessionsDb, clientId, profileId);

  const sessionMemoryKey =
    typeof config.application?.session_memory_key === "string"
      ? config.application.session_memory_key
      : template.application?.session_memory_key
        ? String(template.application.session_memory_key)
        : null;

  if (sessionMemoryKey) {
    await upsertMemory(memoryDb, clientId, sessionMemoryKey, session.id, memoryEnv);
  }

  const feedbackMemoryKey =
    typeof config.application?.feedback_memory_key === "string"
      ? config.application.feedback_memory_key
      : template.application?.feedback_memory_key
        ? String(template.application.feedback_memory_key)
        : null;

  const cron = config.loops.trigger.cron!;
  const createdAt = new Date();
  const nextRunAt = initialNextRunAt(cron, createdAt);

  const [row] = await harnessDb.db
    .insert(harnesses)
    .values({
      clientId,
      name: input.name,
      templateId: template.id,
      templateVersion: String(template.version),
      configVersion: "1",
      config,
      sessionId: session.id,
      cron,
      timezone: config.loops.trigger.timezone ?? "UTC",
      nextRunAt,
      sessionMemoryKey,
      feedbackMemoryKey,
    })
    .returning();

  return rowToJson(row!);
}

export async function listHarnessRecords(harnessDb: HarnessDb, clientId: string) {
  const rows = await harnessDb.db
    .select()
    .from(harnesses)
    .where(eq(harnesses.clientId, clientId))
    .orderBy(desc(harnesses.createdAt));
  return rows.map(rowToJson);
}

export async function getHarnessRecord(
  harnessDb: HarnessDb,
  clientId: string,
  harnessId: string,
) {
  const [row] = await harnessDb.db
    .select()
    .from(harnesses)
    .where(and(eq(harnesses.id, harnessId), eq(harnesses.clientId, clientId)));
  if (!row) throw notFound("Harness not found");
  return rowToJson(row);
}

export async function patchHarnessRecord(
  harnessDb: HarnessDb,
  clientId: string,
  harnessId: string,
  patch: { enabled?: boolean; cron?: string },
) {
  const [existing] = await harnessDb.db
    .select()
    .from(harnesses)
    .where(and(eq(harnesses.id, harnessId), eq(harnesses.clientId, clientId)));
  if (!existing) throw notFound("Harness not found");

  const updates: Partial<typeof harnesses.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (patch.enabled !== undefined) updates.enabled = patch.enabled;
  if (patch.cron !== undefined) {
    updates.cron = patch.cron;
    updates.nextRunAt = initialNextRunAt(patch.cron, new Date());
    const config = { ...existing.config } as HarnessConfig;
    config.loops.trigger.cron = patch.cron;
    updates.config = config;
    updates.configVersion = String(Number(existing.configVersion) + 1);
  }

  const [row] = await harnessDb.db
    .update(harnesses)
    .set(updates)
    .where(eq(harnesses.id, harnessId))
    .returning();
  return rowToJson(row!);
}

export async function listHarnessRunRecords(
  harnessDb: HarnessDb,
  clientId: string,
  harnessId: string,
) {
  await getHarnessRecord(harnessDb, clientId, harnessId);
  const rows = await harnessDb.db
    .select()
    .from(harnessRuns)
    .where(and(eq(harnessRuns.harnessId, harnessId), eq(harnessRuns.clientId, clientId)))
    .orderBy(desc(harnessRuns.startedAt))
    .limit(50);
  return rows.map(runToJson);
}

export async function getHarnessRunRecord(
  harnessDb: HarnessDb,
  clientId: string,
  runId: string,
) {
  const [row] = await harnessDb.db
    .select()
    .from(harnessRuns)
    .where(and(eq(harnessRuns.id, runId), eq(harnessRuns.clientId, clientId)));
  if (!row) throw notFound("Harness run not found");
  return runToJson(row);
}

export async function appendHarnessFeedback(
  harnessDb: HarnessDb,
  memoryDb: MemoryDb,
  memoryEnv: MemoryEnv,
  clientId: string,
  harnessId: string,
  input: { text: string; tags?: string[]; source?: string },
) {
  const harness = await getHarnessRecord(harnessDb, clientId, harnessId);
  const key = harness.feedback_memory_key;
  if (!key) throw badRequest("Harness has no feedback_memory_key configured");

  const existing = await getMemoryByKey(memoryDb, clientId, key);
  const raw = existing ?? '{"version":1,"entries":[]}';
  let data: { version: number; entries: Array<Record<string, unknown>> };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    data = { version: 1, entries: [] };
  }
  data.version = 1;
  data.entries.push({
    date: new Date().toISOString().slice(0, 10),
    source: input.source ?? "founder",
    text: input.text,
    tags: input.tags ?? [],
    harness_id: harnessId,
  });
  await upsertMemory(memoryDb, clientId, key, JSON.stringify(data), memoryEnv);
  return { ok: true as const, key, entry_count: data.entries.length };
}

export { rowToJson, runToJson, resolveAgentMessage, templatePublicId };
