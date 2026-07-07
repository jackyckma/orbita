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

export async function listNoteLinksTo(
  db: MemoryDb,
  clientId: string,
  toId: string,
): Promise<NoteLinkRecord[]> {
  const rows = await db.db
    .select({
      fromId: noteLinks.fromId,
      toId: noteLinks.toId,
      rel: noteLinks.rel,
      createdAt: noteLinks.createdAt,
    })
    .from(noteLinks)
    .where(and(eq(noteLinks.clientId, clientId), eq(noteLinks.toId, toId)))
    .orderBy(desc(noteLinks.createdAt));
  return rows.map((row) => ({
    from_id: row.fromId,
    to_id: row.toId,
    rel: row.rel,
    created_at: row.createdAt.toISOString(),
  }));
}

export type NoteNeighbor = {
  id: string;
  title: string | null;
  body: string;
  depth: number;
  rel: string;
  direction: "out" | "in";
};

export type GetNoteNeighborsOptions = {
  depth?: number;
  includeIncoming?: boolean;
};

export async function getNoteNeighbors(
  db: MemoryDb,
  clientId: string,
  startId: string,
  options?: GetNoteNeighborsOptions,
): Promise<NoteNeighbor[]> {
  const maxDepth = Math.min(Math.max(options?.depth ?? 1, 1), 4);
  const includeIncoming = options?.includeIncoming ?? true;

  const root = await getNoteById(db, clientId, startId);
  if (!root) {
    throw new Error("Note not found");
  }

  const seen = new Set<string>([startId]);
  const out: NoteNeighbor[] = [];
  let frontier: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];

  while (frontier.length > 0) {
    const nextFrontier: Array<{ id: string; depth: number }> = [];
    for (const node of frontier) {
      if (node.depth >= maxDepth) continue;

      const outgoing = await listNoteLinksFrom(db, clientId, node.id);
      for (const link of outgoing) {
        if (seen.has(link.to_id)) continue;
        seen.add(link.to_id);
        const note = await getNoteById(db, clientId, link.to_id);
        if (!note) continue;
        out.push({
          id: note.id,
          title: note.title,
          body: note.body,
          depth: node.depth + 1,
          rel: link.rel,
          direction: "out",
        });
        nextFrontier.push({ id: link.to_id, depth: node.depth + 1 });
      }

      if (includeIncoming) {
        const incoming = await listNoteLinksTo(db, clientId, node.id);
        for (const link of incoming) {
          if (seen.has(link.from_id)) continue;
          seen.add(link.from_id);
          const note = await getNoteById(db, clientId, link.from_id);
          if (!note) continue;
          out.push({
            id: note.id,
            title: note.title,
            body: note.body,
            depth: node.depth + 1,
            rel: link.rel,
            direction: "in",
          });
          nextFrontier.push({ id: link.from_id, depth: node.depth + 1 });
        }
      }
    }
    frontier = nextFrontier;
  }

  return out;
}

export type NoteSearchHit = {
  id: string;
  title: string | null;
  body: string;
  updated_at: string;
};

export async function searchNotes(
  db: MemoryDb,
  clientId: string,
  queryText: string,
  env: MemoryEnv,
  topK = 8,
): Promise<NoteSearchHit[]> {
  const embedding = await embedText(env, queryText.trim());
  if (!embedding) return [];

  const vector = formatVectorLiteral(embedding);
  const rows = await db.client.unsafe<
    Array<{ id: string; title: string | null; body: string; updated_at: Date }>
  >(
    `SELECT id, title, body, updated_at
     FROM notes
     WHERE client_id = $1 AND embedding IS NOT NULL
     ORDER BY embedding <=> $2::vector
     LIMIT $3`,
    [clientId, vector, topK],
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    updated_at: row.updated_at.toISOString(),
  }));
}

export function formatNoteContextLines(
  notes: Array<{ id: string; title: string | null; body: string }>,
): string {
  if (notes.length === 0) return "";
  return notes
    .map((note) => {
      const heading = note.title?.trim() ? note.title.trim() : note.id;
      const bodyPreview =
        note.body.length > 1200 ? `${note.body.slice(0, 1200)}…` : note.body;
      return `### ${heading} (${note.id})\n${bodyPreview}`;
    })
    .join("\n\n");
}

export type NoteContextOptions = {
  graphFrom?: string;
  depth?: number;
  includeIncoming?: boolean;
  queryText?: string;
  env?: MemoryEnv;
  topK?: number;
};

export async function getNoteContext(
  db: MemoryDb,
  clientId: string,
  options?: NoteContextOptions,
): Promise<string> {
  const topK = options?.topK ?? options?.env?.MEMORY_TOP_K ?? 8;
  const byId = new Map<string, { id: string; title: string | null; body: string }>();

  if (options?.graphFrom) {
    try {
      const neighbors = await getNoteNeighbors(db, clientId, options.graphFrom, {
        depth: options.depth,
        includeIncoming: options.includeIncoming,
      });
      for (const neighbor of neighbors) {
        byId.set(neighbor.id, {
          id: neighbor.id,
          title: neighbor.title,
          body: neighbor.body,
        });
      }
      const root = await getNoteById(db, clientId, options.graphFrom);
      if (root) {
        byId.set(root.id, { id: root.id, title: root.title, body: root.body });
      }
    } catch {
      // graph root missing — fall through to vector search only
    }
  }

  const queryText = options?.queryText?.trim();
  if (queryText && options?.env) {
    const hits = await searchNotes(db, clientId, queryText, options.env, topK);
    for (const hit of hits) {
      if (!byId.has(hit.id)) {
        byId.set(hit.id, { id: hit.id, title: hit.title, body: hit.body });
      }
    }
  }

  if (byId.size === 0 && options?.env) {
    const rows = await db.db
      .select({ id: notes.id, title: notes.title, body: notes.body })
      .from(notes)
      .where(eq(notes.clientId, clientId))
      .orderBy(desc(notes.updatedAt))
      .limit(topK);
    for (const row of rows) {
      byId.set(row.id, { id: row.id, title: row.title, body: row.body });
    }
  }

  return formatNoteContextLines([...byId.values()]);
}
