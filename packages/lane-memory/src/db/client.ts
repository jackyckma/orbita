import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type MemoryDb = ReturnType<typeof createMemoryDb>;

export function createMemoryDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 5 });
  return { db: drizzle(client, { schema }), client };
}

export { schema };
