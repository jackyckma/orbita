import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const clientMemories = pgTable("client_memories", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: text("client_id").notNull(),
  key: text("key").notNull(),
  content: text("content").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
