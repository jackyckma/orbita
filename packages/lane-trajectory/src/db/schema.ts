import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const trajectoryEvents = pgTable("trajectory_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull(),
  clientId: text("client_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type TrajectoryEventRow = typeof trajectoryEvents.$inferSelect;
