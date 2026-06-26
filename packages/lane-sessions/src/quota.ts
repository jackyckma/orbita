import { and, eq, gte, sql } from "drizzle-orm";
import { quotaExceeded } from "@orbita/platform";
import type { SessionsDb } from "./db/client.js";
import { messages, sessions } from "./db/schema.js";

export type QuotaLimits = {
  sessionsPerDay: number;
  messagesPerDay: number;
};

function rollingSince(): Date {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

export async function countClientSessionsLast24h(
  db: SessionsDb,
  clientId: string,
): Promise<number> {
  const since = rollingSince();
  const [row] = await db.db
    .select({ count: sql<number>`count(*)::int` })
    .from(sessions)
    .where(and(eq(sessions.clientId, clientId), gte(sessions.createdAt, since)));
  return row?.count ?? 0;
}

export async function countClientMessagesLast24h(
  db: SessionsDb,
  clientId: string,
): Promise<number> {
  const since = rollingSince();
  const [row] = await db.db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(sessions, eq(messages.sessionId, sessions.id))
    .where(
      and(
        eq(sessions.clientId, clientId),
        eq(messages.role, "user"),
        gte(messages.createdAt, since),
      ),
    );
  return row?.count ?? 0;
}

export async function assertClientSessionQuota(
  db: SessionsDb,
  clientId: string,
  limits: QuotaLimits,
): Promise<void> {
  const limit = limits.sessionsPerDay;
  if (limit <= 0) return;
  const count = await countClientSessionsLast24h(db, clientId);
  if (count >= limit) {
    throw quotaExceeded("Daily session quota exceeded", {
      resource: "sessions",
      limit_per_day: limit,
      used_last_24h: count,
      client_id: clientId,
    });
  }
}

export async function assertClientMessageQuota(
  db: SessionsDb,
  clientId: string,
  limits: QuotaLimits,
): Promise<void> {
  const limit = limits.messagesPerDay;
  if (limit <= 0) return;
  const count = await countClientMessagesLast24h(db, clientId);
  if (count >= limit) {
    throw quotaExceeded("Daily message quota exceeded", {
      resource: "messages",
      limit_per_day: limit,
      used_last_24h: count,
      client_id: clientId,
    });
  }
}
