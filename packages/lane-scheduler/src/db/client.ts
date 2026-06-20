import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type SchedulerDb = ReturnType<typeof createSchedulerDb>;

export function createSchedulerDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 5 });
  return { db: drizzle(client, { schema }), client };
}

export { schema };
