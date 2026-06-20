import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type SessionsDb = ReturnType<typeof createSessionsDb>;

export function createSessionsDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 10 });
  const db = drizzle(client, { schema });
  return { db, client };
}

export async function closeSessionsDb(sessionsDb: SessionsDb): Promise<void> {
  await sessionsDb.client.end({ timeout: 5 });
}

export { schema };
