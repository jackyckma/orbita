import type { AuthDb } from "../db/client.js";

export async function incrementRateLimitCount(
  db: AuthDb,
  keyId: string,
  windowStart: Date,
): Promise<number> {
  const rows = await db.client.unsafe<{ count: number }[]>(
    `INSERT INTO rate_limit_counters (key_id, window_start, count)
     VALUES ($1, $2, 1)
     ON CONFLICT (key_id, window_start)
     DO UPDATE SET count = rate_limit_counters.count + 1
     RETURNING count`,
    [keyId, windowStart.toISOString()],
  );
  return rows[0]?.count ?? 1;
}
