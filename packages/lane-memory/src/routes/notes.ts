import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ApiErrorBodySchema } from "@orbita/platform";
import { getAuth } from "@orbita/auth";
import { badRequest, notFound } from "@orbita/platform";
import type { MemoryDb } from "../db/client.js";
import type { MemoryEnv } from "../config.js";
import {
  createNoteLink,
  getNoteById,
  listNoteLinksFrom,
  listNotes,
  upsertNote,
} from "../notes-service.js";

const NoteSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string(),
  title: z.string().nullable(),
  body: z.string(),
  frontmatter: z.record(z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
});

const NoteLinkSchema = z.object({
  from_id: z.string().uuid(),
  to_id: z.string().uuid(),
  rel: z.string(),
  created_at: z.string(),
});

export function createNoteRoutes(db: MemoryDb, env: MemoryEnv): OpenAPIHono {
  const app = new OpenAPIHono();

  const listRoute = createRoute({
    method: "get",
    path: "/notes",
    tags: ["Notes"],
    summary: "List notes for the authenticated client",
    responses: {
      200: {
        description: "Note list",
        content: {
          "application/json": {
            schema: z.object({
              notes: z.array(
                z.object({
                  id: z.string().uuid(),
                  title: z.string().nullable(),
                  updated_at: z.string(),
                }),
              ),
            }),
          },
        },
      },
    },
  });

  app.openapi(listRoute, async (c) => {
    const auth = getAuth(c);
    const items = await listNotes(db, auth.clientId);
    return c.json({ notes: items }, 200);
  });

  const getRoute = createRoute({
    method: "get",
    path: "/notes/{id}",
    tags: ["Notes"],
    summary: "Read a note by id",
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: {
        description: "Note",
        content: { "application/json": { schema: NoteSchema } },
      },
      404: {
        description: "Not found",
        content: { "application/json": { schema: ApiErrorBodySchema } },
      },
    },
  });

  app.openapi(getRoute, async (c) => {
    const auth = getAuth(c);
    const { id } = c.req.valid("param");
    const note = await getNoteById(db, auth.clientId, id);
    if (!note) throw notFound("Note not found");
    return c.json(note, 200);
  });

  const upsertRoute = createRoute({
    method: "put",
    path: "/notes/{id}",
    tags: ["Notes"],
    summary: "Create or update a note",
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              title: z.string().optional().nullable(),
              body: z.string().min(1),
              frontmatter: z.record(z.unknown()).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Note stored",
        content: { "application/json": { schema: NoteSchema } },
      },
      400: {
        description: "Bad request",
        content: { "application/json": { schema: ApiErrorBodySchema } },
      },
    },
  });

  app.openapi(upsertRoute, async (c) => {
    const auth = getAuth(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const note = await upsertNote(
      db,
      auth.clientId,
      {
        id,
        title: body.title,
        body: body.body,
        frontmatter: body.frontmatter,
      },
      env,
    );
    return c.json(note, 200);
  });

  const createLinkRoute = createRoute({
    method: "post",
    path: "/notes/links",
    tags: ["Notes"],
    summary: "Create a directed link between two notes",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              from_id: z.string().uuid(),
              to_id: z.string().uuid(),
              rel: z.string().min(1),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Link created",
        content: { "application/json": { schema: NoteLinkSchema } },
      },
      400: {
        description: "Bad request",
        content: { "application/json": { schema: ApiErrorBodySchema } },
      },
    },
  });

  app.openapi(createLinkRoute, async (c) => {
    const auth = getAuth(c);
    const body = c.req.valid("json");
    try {
      const link = await createNoteLink(
        db,
        auth.clientId,
        body.from_id,
        body.to_id,
        body.rel,
      );
      return c.json(link, 200);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw badRequest(message);
    }
  });

  const listLinksRoute = createRoute({
    method: "get",
    path: "/notes/{id}/links",
    tags: ["Notes"],
    summary: "List outgoing links from a note",
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: {
        description: "Outgoing links",
        content: {
          "application/json": {
            schema: z.object({ links: z.array(NoteLinkSchema) }),
          },
        },
      },
      404: {
        description: "Not found",
        content: { "application/json": { schema: ApiErrorBodySchema } },
      },
    },
  });

  app.openapi(listLinksRoute, async (c) => {
    const auth = getAuth(c);
    const { id } = c.req.valid("param");
    const note = await getNoteById(db, auth.clientId, id);
    if (!note) throw notFound("Note not found");
    const links = await listNoteLinksFrom(db, auth.clientId, id);
    return c.json({ links }, 200);
  });

  return app;
}
