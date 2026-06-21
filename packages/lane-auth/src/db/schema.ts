import { relations } from "drizzle-orm";
import {
  jsonb,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  keyPrefix: text("key_prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  allowedClientIds: jsonb("allowed_client_ids")
    .$type<string[]>()
    .notNull()
    .default([]),
  scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
  rateLimitPerMinute: integer("rate_limit_per_minute"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const apiKeysRelations = relations(apiKeys, () => ({}));

export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    keyId: uuid("key_id").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.keyId, table.windowStart] })],
);

export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type NewApiKeyRow = typeof apiKeys.$inferInsert;
