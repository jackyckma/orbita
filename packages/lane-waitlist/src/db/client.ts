import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type WaitlistDb = {
  db: ReturnType<typeof drizzle<typeof schema>>;
  sql: ReturnType<typeof postgres>;
  client: ReturnType<typeof postgres>;
};

export function createWaitlistDb(databaseUrl: string): WaitlistDb {
  const sql = postgres(databaseUrl, { max: 4 });
  return { sql, client: sql, db: drizzle(sql, { schema }) };
}

export async function closeWaitlistDb(db: WaitlistDb): Promise<void> {
  await db.sql.end({ timeout: 5 });
}

export { schema };
