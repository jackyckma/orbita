import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const clientMemories = pgTable("client_memories", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: text("client_id").notNull(),
  key: text("key").notNull(),
  content: text("content").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const notes = pgTable("notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: text("client_id").notNull(),
  title: text("title"),
  body: text("body").notNull(),
  frontmatter: jsonb("frontmatter").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const noteLinks = pgTable("note_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: text("client_id").notNull(),
  fromId: uuid("from_id").notNull(),
  toId: uuid("to_id").notNull(),
  rel: text("rel").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
