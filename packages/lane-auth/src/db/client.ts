import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type AuthDb = ReturnType<typeof createAuthDb>;

export function createAuthDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 10 });
  const db = drizzle(client, { schema });
  return { db, client };
}

export async function closeAuthDb(authDb: AuthDb): Promise<void> {
  await authDb.client.end({ timeout: 5 });
}

export { schema };
