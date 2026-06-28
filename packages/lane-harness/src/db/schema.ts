import { boolean, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { HarnessConfig } from "../types.js";

export const harnesses = pgTable("harnesses", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: text("client_id").notNull(),
  name: text("name").notNull(),
  templateId: text("template_id").notNull(),
  templateVersion: text("template_version").notNull().default("1"),
  configVersion: text("config_version").notNull().default("1"),
  config: jsonb("config").$type<HarnessConfig>().notNull(),
  sessionId: uuid("session_id").notNull(),
  cron: text("cron"),
  timezone: text("timezone").notNull().default("UTC"),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  sessionMemoryKey: text("session_memory_key"),
  feedbackMemoryKey: text("feedback_memory_key"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const harnessRuns = pgTable(
  "harness_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    harnessId: uuid("harness_id").notNull(),
    clientId: text("client_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    status: text("status").notNull(),
    trigger: text("trigger").notNull(),
    cronFingerprint: text("cron_fingerprint"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("harness_runs_idempotency_idx").on(table.harnessId, table.cronFingerprint),
  ],
);

export type HarnessRow = typeof harnesses.$inferSelect;
export type HarnessRunRow = typeof harnessRuns.$inferSelect;
