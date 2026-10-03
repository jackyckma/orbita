import { desc, eq } from "drizzle-orm";
import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { badRequest, notFound } from "@orbita/platform";
import type { AdminDb } from "./settings.js";

const harnessesTable = pgTable("harnesses", {
  id: uuid("id").primaryKey(),
  clientId: text("client_id").notNull(),
  name: text("name").notNull(),
  templateId: text("template_id").notNull(),
  cron: text("cron"),
  timezone: text("timezone").notNull(),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  enabled: boolean("enabled").notNull(),
  config: jsonb("config").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

const harnessRunsTable = pgTable("harness_runs", {
  id: uuid("id").primaryKey(),
  harnessId: uuid("harness_id").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export type AdminHarnessLatestRun = {
  status: string;
  started_at: string;
  finished_at: string | null;
  error: string | null;
};

export type AdminHarnessRow = {
  id: string;
  client_id: string;
  name: string;
  template_id: string;
  enabled: boolean;
  cron: string | null;
  timezone: string;
  next_run_at: string | null;
  last_run_at: string | null;
  session_policy: "sticky" | "per_run";
  latest_run: AdminHarnessLatestRun | null;
};

const ERROR_TRUNCATE = 200;

function toIso(value: Date | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function truncateError(error: string | null | undefined): string | null {
  if (!error) return null;
  if (error.length <= ERROR_TRUNCATE) return error;
  return error.slice(0, ERROR_TRUNCATE);
}

function sessionPolicyFromConfig(config: unknown): "sticky" | "per_run" {
  if (config && typeof config === "object" && "session_policy" in config) {
    const sp = (config as { session_policy?: unknown }).session_policy;
    if (sp === "per_run") return "per_run";
  }
  return "sticky";
}

type LatestRunRow = {
  harness_id: string;
  status: string;
  started_at: Date;
  finished_at: Date | null;
  error: string | null;
};

async function loadLatestRunsByHarnessId(adminDb: AdminDb): Promise<Map<string, LatestRunRow>> {
  const rows = await adminDb.sql<LatestRunRow[]>`
    SELECT DISTINCT ON (harness_id)
      harness_id,
      status,
      started_at,
      finished_at,
      error
    FROM harness_runs
    ORDER BY harness_id, started_at DESC
  `;
  const map = new Map<string, LatestRunRow>();
  for (const row of rows) {
    map.set(row.harness_id, row);
  }
  return map;
}

function rowToAdminHarness(
  row: typeof harnessesTable.$inferSelect,
  latest: LatestRunRow | undefined,
): AdminHarnessRow {
  return {
    id: row.id,
    client_id: row.clientId,
    name: row.name,
    template_id: row.templateId,
    enabled: row.enabled,
    cron: row.cron,
    timezone: row.timezone,
    next_run_at: toIso(row.nextRunAt),
    last_run_at: toIso(row.lastRunAt),
    session_policy: sessionPolicyFromConfig(row.config),
    latest_run: latest
      ? {
          status: latest.status,
          started_at: toIso(latest.started_at)!,
          finished_at: toIso(latest.finished_at),
          error: truncateError(latest.error),
        }
      : null,
  };
}

export async function listAdminHarnesses(adminDb: AdminDb): Promise<AdminHarnessRow[]> {
  const rows = await adminDb.db
    .select()
    .from(harnessesTable)
    .orderBy(desc(harnessesTable.createdAt));
  const latestMap = await loadLatestRunsByHarnessId(adminDb);
  return rows.map((row) => rowToAdminHarness(row, latestMap.get(row.id)));
}

export async function patchAdminHarnessEnabled(
  adminDb: AdminDb,
  harnessId: string,
  enabled: boolean,
): Promise<AdminHarnessRow> {
  const [row] = await adminDb.db
    .update(harnessesTable)
    .set({ enabled })
    .where(eq(harnessesTable.id, harnessId))
    .returning();
  if (!row) {
    throw notFound("Harness not found");
  }
  const latestMap = await loadLatestRunsByHarnessId(adminDb);
  return rowToAdminHarness(row, latestMap.get(row.id));
}

export function assertHarnessPatchBody(body: unknown): { enabled: boolean; reason: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw badRequest("Invalid JSON body");
  }
  const keys = Object.keys(body as Record<string, unknown>);
  if (keys.length !== 2 || !keys.includes("enabled") || !keys.includes("reason")) {
    throw badRequest("Body must contain only enabled and reason");
  }
  const { enabled, reason } = body as { enabled?: unknown; reason?: unknown };
  if (typeof enabled !== "boolean") {
    throw badRequest("enabled must be a boolean");
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw badRequest("reason is required");
  }
  if (reason.length > 200) {
    throw badRequest("reason must be at most 200 characters");
  }
  return { enabled, reason: reason.trim() };
}

/** Fields that must never appear in admin harness API responses. */
export const FORBIDDEN_HARNESS_RESPONSE_KEYS = [
  "config",
  "secret",
  "credentials",
  "session_id",
  "session_memory_key",
  "feedback_memory_key",
] as const;

export function collectJsonKeys(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (value === null || typeof value !== "object") {
    return into;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonKeys(item, into);
    }
    return into;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    into.add(key);
    collectJsonKeys(child, into);
  }
  return into;
}
