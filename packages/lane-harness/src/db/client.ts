import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type HarnessDb = ReturnType<typeof createHarnessDb>;

export function createHarnessDb(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 10 });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

export async function closeHarnessDb(harnessDb: HarnessDb) {
  await harnessDb.sql.end({ timeout: 5 });
}

export { schema };
