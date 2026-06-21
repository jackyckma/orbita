import { and, desc, eq } from "drizzle-orm";
import type { MemoryEnv } from "./config.js";
import type { MemoryDb } from "./db/client.js";
import { clientMemories } from "./db/schema.js";
import { embedText, formatVectorLiteral } from "./embed.js";

export function formatMemoryLines(
  rows: Array<{ key: string; content: string }>,
): string {
  if (rows.length === 0) return "";
  return rows.map((row) => `- [${row.key}] ${row.content}`).join("\n");
}

async function searchBySimilarity(
  db: MemoryDb,
  clientId: string,
  embedding: number[],
  topK: number,
): Promise<Array<{ key: string; content: string }>> {
  const vector = formatVectorLiteral(embedding);
  const rows = await db.client.unsafe<
    Array<{ key: string; content: string }>
  >(
    `SELECT key, content
     FROM client_memories
     WHERE client_id = $1 AND embedding IS NOT NULL
     ORDER BY embedding <=> $2::vector
     LIMIT $3`,
    [clientId, vector, topK],
  );
  return rows;
}

async function listRecentMemories(
  db: MemoryDb,
  clientId: string,
  limit: number,
): Promise<Array<{ key: string; content: string }>> {
  return db.db
    .select({ key: clientMemories.key, content: clientMemories.content })
    .from(clientMemories)
    .where(eq(clientMemories.clientId, clientId))
    .orderBy(desc(clientMemories.updatedAt))
    .limit(limit);
}

export type MemoryContextOptions = {
  queryText?: string;
  env?: MemoryEnv;
  topK?: number;
};

export async function getMemoryContext(
  db: MemoryDb,
  clientId: string,
  options?: MemoryContextOptions,
): Promise<string> {
  const topK = options?.topK ?? options?.env?.MEMORY_TOP_K ?? 8;
  const queryText = options?.queryText?.trim();

  if (queryText && options?.env) {
    const embedding = await embedText(options.env, queryText);
    if (embedding) {
      const rows = await searchBySimilarity(db, clientId, embedding, topK);
      if (rows.length > 0) {
        return formatMemoryLines(rows);
      }
    }
  }

  const rows = await listRecentMemories(db, clientId, topK);
  return formatMemoryLines(rows);
}

export async function listMemories(db: MemoryDb, clientId: string) {
  const rows = await db.db
    .select({
      key: clientMemories.key,
      updated_at: clientMemories.updatedAt,
    })
    .from(clientMemories)
    .where(eq(clientMemories.clientId, clientId))
    .orderBy(desc(clientMemories.updatedAt));
  return rows.map((row) => ({
    key: row.key,
    updated_at: row.updated_at.toISOString(),
  }));
}

export async function upsertMemory(
  db: MemoryDb,
  clientId: string,
  key: string,
  content: string,
  env?: MemoryEnv,
) {
  const embedding = env ? await embedText(env, `${key}\n${content}`) : null;
  const embeddingLiteral = embedding ? formatVectorLiteral(embedding) : null;

  const existing = await db.db
    .select({ id: clientMemories.id })
    .from(clientMemories)
    .where(and(eq(clientMemories.clientId, clientId), eq(clientMemories.key, key)))
    .limit(1);

  if (existing.length > 0) {
    if (embeddingLiteral) {
      await db.client.unsafe(
        `UPDATE client_memories
         SET content = $1, updated_at = now(), embedding = $2::vector
         WHERE id = $3`,
        [content, embeddingLiteral, existing[0]!.id],
      );
    } else {
      await db.db
        .update(clientMemories)
        .set({ content, updatedAt: new Date() })
        .where(eq(clientMemories.id, existing[0]!.id));
    }
    return;
  }

  if (embeddingLiteral) {
    await db.client.unsafe(
      `INSERT INTO client_memories (client_id, key, content, embedding)
       VALUES ($1, $2, $3, $4::vector)`,
      [clientId, key, content, embeddingLiteral],
    );
    return;
  }

  await db.db.insert(clientMemories).values({ clientId, key, content });
}
