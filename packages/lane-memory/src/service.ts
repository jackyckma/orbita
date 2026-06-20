import { eq } from "drizzle-orm";
import type { MemoryDb } from "./db/client.js";
import { clientMemories } from "./db/schema.js";

export async function getMemoryContext(db: MemoryDb, clientId: string): Promise<string> {
  const rows = await db.db
    .select()
    .from(clientMemories)
    .where(eq(clientMemories.clientId, clientId));
  if (rows.length === 0) return "";
  return rows
    .map((row) => `- [${row.key}] ${row.content}`)
    .join("\n");
}

export async function upsertMemory(
  db: MemoryDb,
  clientId: string,
  key: string,
  content: string,
) {
  const existing = await db.db
    .select()
    .from(clientMemories)
    .where(eq(clientMemories.clientId, clientId));
  const match = existing.find((r) => r.key === key);
  if (match) {
    await db.db
      .update(clientMemories)
      .set({ content, updatedAt: new Date() })
      .where(eq(clientMemories.id, match.id));
    return;
  }
  await db.db.insert(clientMemories).values({ clientId, key, content });
}
