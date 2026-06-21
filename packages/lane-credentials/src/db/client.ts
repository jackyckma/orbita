import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type CredentialsDb = ReturnType<typeof createCredentialsDb>;

export function createCredentialsDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 5 });
  return { db: drizzle(client, { schema }), client };
}

export { schema };
