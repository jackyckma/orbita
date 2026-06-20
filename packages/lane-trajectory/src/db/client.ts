import { drizzle } from "drizzle-orm/postgres-js";
import { and, asc, eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema.js";
import { trajectoryEvents } from "./schema.js";

export type TrajectoryDb = {
  db: ReturnType<typeof drizzle<typeof schema>>;
  client: ReturnType<typeof postgres>;
};

export function createTrajectoryDb(databaseUrl: string): TrajectoryDb {
  const client = postgres(databaseUrl, { max: 5 });
  const db = drizzle(client, { schema });
  return { db, client };
}

export async function logTrajectoryEvent(
  trajectoryDb: TrajectoryDb,
  input: {
    sessionId: string;
    clientId: string;
    eventType: string;
    payload: Record<string, unknown>;
  },
) {
  const [row] = await trajectoryDb.db
    .insert(trajectoryEvents)
    .values({
      sessionId: input.sessionId,
      clientId: input.clientId,
      eventType: input.eventType,
      payload: redactPayload(input.payload),
    })
    .returning();
  return row!;
}

export async function listTrajectoryEvents(
  trajectoryDb: TrajectoryDb,
  sessionId: string,
  clientId: string,
) {
  return trajectoryDb.db
    .select()
    .from(trajectoryEvents)
    .where(
      and(
        eq(trajectoryEvents.sessionId, sessionId),
        eq(trajectoryEvents.clientId, clientId),
      ),
    )
    .orderBy(asc(trajectoryEvents.createdAt));
}

function redactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const clone = structuredClone(payload);
  for (const key of Object.keys(clone)) {
    if (/secret|token|password|credential/i.test(key)) {
      clone[key] = "[REDACTED]";
    }
  }
  return clone;
}

export { schema };
