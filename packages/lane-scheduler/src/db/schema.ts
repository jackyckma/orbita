import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const sessionJobs = pgTable("session_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull(),
  clientId: text("client_id").notNull(),
  everySeconds: integer("every_seconds").notNull(),
  task: jsonb("task").$type<Record<string, unknown>>().notNull(),
  outputRouting: jsonb("output_routing")
    .$type<{ mode: "poll" | "webhook" | "external_write"; webhook_url?: string }>()
    .notNull(),
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
