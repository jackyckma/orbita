import { relations } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const credentials = pgTable(
  "credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: text("client_id").notNull(),
    name: text("name").notNull(),
    secretCiphertext: text("secret_ciphertext").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique("credentials_client_name_unique").on(table.clientId, table.name)],
);

export const credentialsRelations = relations(credentials, () => ({}));

export type CredentialRow = typeof credentials.$inferSelect;
