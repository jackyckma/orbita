import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type OAuthDb = ReturnType<typeof createOAuthDb>;

export function createOAuthDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 10 });
  const db = drizzle(client, { schema });
  return { db, client };
}

export async function closeOAuthDb(oauthDb: OAuthDb): Promise<void> {
  await oauthDb.client.end({ timeout: 5 });
}

export { schema };
