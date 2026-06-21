import { relations } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { AgentProfileSnapshot } from "@orbita/profiles";
import type { ExecutionMeta, MessageInput, MessageOutput } from "@orbita/platform";

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: text("client_id").notNull(),
  agentProfileId: text("agent_profile_id").notNull(),
  profileSnapshot: jsonb("profile_snapshot")
    .$type<AgentProfileSnapshot>()
    .notNull(),
  status: text("status").$type<"active" | "ended">().notNull().default("active"),
  tokenCountEstimate: integer("token_count_estimate").notNull().default(0),
  contextSummary: text("context_summary"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  role: text("role").$type<"user" | "assistant" | "system">().notNull(),
  input: jsonb("input").$type<MessageInput | null>(),
  output: jsonb("output").$type<MessageOutput | null>(),
  executionMeta: jsonb("execution_meta").$type<ExecutionMeta | null>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessionsRelations = relations(sessions, ({ many }) => ({
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  session: one(sessions, {
    fields: [messages.sessionId],
    references: [sessions.id],
  }),
}));

export type SessionRow = typeof sessions.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
