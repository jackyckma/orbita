import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { MemoryEnv } from "./config.js";
import type { MemoryDb } from "./db/client.js";
import { noteLinks, notes } from "./db/schema.js";
import { embedText, formatVectorLiteral } from "./embed.js";

export type NoteRecord = {
  id: string;
  client_id: string;
  title: string | null;
  body: string;
  frontmatter: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type NoteListItem = {
  id: string;
  title: string | null;
  updated_at: string;
};

export type NoteLinkRecord = {
  from_id: string;
  to_id: string;
  rel: string;
  created_at: string;
};

function toNoteRecord(row: {
  id: string;
  clientId: string;
  title: string | null;
  body: string;
  frontmatter: unknown;
  createdAt: Date;
  updatedAt: Date;
}): NoteRecord {
  return {
    id: row.id,
    client_id: row.clientId,
    title: row.title,
    body: row.body,
    frontmatter:
      row.frontmatter && typeof row.frontmatter === "object" && !Array.isArray(row.frontmatter)
        ? (row.frontmatter as Record<string, unknown>)
        : {},
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function noteEmbedText(title: string | null | undefined, body: string): string {
  return title?.trim() ? `${title.trim()}\n${body}` : body;
}

export async function listNotes(
  db: MemoryDb,
  clientId: string,
  limit = 50,
): Promise<NoteListItem[]> {
  const rows = await db.db
    .select({
      id: notes.id,
      title: notes.title,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(eq(notes.clientId, clientId))
    .orderBy(desc(notes.updatedAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    updated_at: row.updatedAt.toISOString(),
  }));
}

export async function getNoteById(
  db: MemoryDb,
  clientId: string,
  id: string,
): Promise<NoteRecord | null> {
  const [row] = await db.db
    .select()
    .from(notes)
    .where(and(eq(notes.clientId, clientId), eq(notes.id, id)))
    .limit(1);
  return row ? toNoteRecord(row) : null;
}

export type UpsertNoteInput = {
  id?: string;
  title?: string | null;
  body: string;
  frontmatter?: Record<string, unknown>;
};

export async function upsertNote(
  db: MemoryDb,
  clientId: string,
  input: UpsertNoteInput,
  env?: MemoryEnv,
): Promise<NoteRecord> {
  const id = input.id?.trim() || randomUUID();
  const title = input.title?.trim() ? input.title.trim() : null;
  const body = input.body;
  const frontmatter = input.frontmatter ?? {};
  const embedding = env ? await embedText(env, noteEmbedText(title, body)) : null;
  const embeddingLiteral = embedding ? formatVectorLiteral(embedding) : null;

  const existing = await db.db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.clientId, clientId), eq(notes.id, id)))
    .limit(1);

  if (existing.length > 0) {
    if (embeddingLiteral) {
      await db.client.unsafe(
        `UPDATE notes
         SET title = $1, body = $2, frontmatter = $3::jsonb, updated_at = now(), embedding = $4::vector
         WHERE id = $5 AND client_id = $6`,
        [title, body, JSON.stringify(frontmatter), embeddingLiteral, id, clientId],
      );
    } else {
      await db.db
        .update(notes)
        .set({ title, body, frontmatter, updatedAt: new Date() })
        .where(and(eq(notes.id, id), eq(notes.clientId, clientId)));
    }
  } else if (embeddingLiteral) {
    await db.client.unsafe(
      `INSERT INTO notes (id, client_id, title, body, frontmatter, embedding)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::vector)`,
      [id, clientId, title, body, JSON.stringify(frontmatter), embeddingLiteral],
    );
  } else {
    await db.db.insert(notes).values({
      id,
      clientId,
      title,
      body,
      frontmatter,
    });
  }

  const note = await getNoteById(db, clientId, id);
  if (!note) {
    throw new Error("Failed to persist note");
  }
  return note;
}

export async function createNoteLink(
  db: MemoryDb,
  clientId: string,
  fromId: string,
  toId: string,
  rel: string,
): Promise<NoteLinkRecord> {
  if (fromId === toId) {
    throw new Error("from_id and to_id must differ");
  }

  const owned = await db.db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.clientId, clientId), eq(notes.id, fromId)))
    .limit(1);
  if (owned.length === 0) {
    throw new Error("from_id note not found");
  }

  const target = await db.db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.clientId, clientId), eq(notes.id, toId)))
    .limit(1);
  if (target.length === 0) {
    throw new Error("to_id note not found");
  }

  await db.client.unsafe(
    `INSERT INTO note_links (client_id, from_id, to_id, rel)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ON CONSTRAINT note_links_unique DO NOTHING`,
    [clientId, fromId, toId, rel],
  );

  const [row] = await db.db
    .select({
      fromId: noteLinks.fromId,
      toId: noteLinks.toId,
      rel: noteLinks.rel,
      createdAt: noteLinks.createdAt,
    })
    .from(noteLinks)
    .where(
      and(
        eq(noteLinks.clientId, clientId),
        eq(noteLinks.fromId, fromId),
        eq(noteLinks.toId, toId),
        eq(noteLinks.rel, rel),
      ),
    )
    .limit(1);

  if (!row) {
    throw new Error("Failed to create note link");
  }

  return {
    from_id: row.fromId,
    to_id: row.toId,
    rel: row.rel,
    created_at: row.createdAt.toISOString(),
  };
}

export async function listNoteLinksFrom(
  db: MemoryDb,
  clientId: string,
  fromId: string,
): Promise<NoteLinkRecord[]> {
  const rows = await db.db
    .select({
      fromId: noteLinks.fromId,
      toId: noteLinks.toId,
      rel: noteLinks.rel,
      createdAt: noteLinks.createdAt,
    })
    .from(noteLinks)
    .where(and(eq(noteLinks.clientId, clientId), eq(noteLinks.fromId, fromId)))
    .orderBy(desc(noteLinks.createdAt));
  return rows.map((row) => ({
    from_id: row.fromId,
    to_id: row.toId,
    rel: row.rel,
    created_at: row.createdAt.toISOString(),
  }));
}
