import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { MemoryDb, MemoryEnv } from "@orbita/memory";
import {
  createNoteLink,
  getMemoryByKey,
  getNoteById,
  getNoteNeighbors,
  listMemories,
  listNoteLinksFrom,
  listNotes,
  searchNotes,
  upsertMemory,
  upsertNote,
} from "@orbita/memory";
import { z } from "zod";

export type OrbitaMcpDeps = {
  clientId: string;
  keyPrefix: string;
  scopes: string[];
  memoryDb: MemoryDb;
  memoryEnv: MemoryEnv;
  version: string;
};

function textResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function registerOrbitaTools(server: McpServer, deps: OrbitaMcpDeps) {
  const { clientId, memoryDb, memoryEnv } = deps;

  server.registerTool(
    "orbita_whoami",
    {
      title: "Orbita whoami",
      description: "Return the authenticated Orbita client_id and API key metadata.",
      inputSchema: z.object({}),
    },
    async () =>
      textResult({
        client_id: clientId,
        key_prefix: deps.keyPrefix,
        scopes: deps.scopes,
      }),
  );

  server.registerTool(
    "memory_list",
    {
      title: "List memories",
      description: "List flat memory keys for the authenticated client.",
      inputSchema: z.object({}),
    },
    async () => textResult({ memories: await listMemories(memoryDb, clientId) }),
  );

  server.registerTool(
    "memory_get",
    {
      title: "Get memory",
      description: "Read a flat memory entry by key.",
      inputSchema: z.object({ key: z.string().min(1) }),
    },
    async ({ key }) => {
      const content = await getMemoryByKey(memoryDb, clientId, key);
      if (content === null) {
        return {
          content: [{ type: "text" as const, text: `Memory not found: ${key}` }],
          isError: true,
        };
      }
      return textResult({ key, content });
    },
  );

  server.registerTool(
    "memory_put",
    {
      title: "Put memory",
      description: "Upsert a flat memory entry by key.",
      inputSchema: z.object({
        key: z.string().min(1),
        content: z.string(),
      }),
    },
    async ({ key, content }) => {
      await upsertMemory(memoryDb, clientId, key, content, memoryEnv);
      return textResult({ key, updated: true });
    },
  );

  server.registerTool(
    "note_list",
    {
      title: "List notes",
      description: "List note ids and titles for the authenticated client.",
      inputSchema: z.object({}),
    },
    async () => textResult({ notes: await listNotes(memoryDb, clientId) }),
  );

  server.registerTool(
    "note_get",
    {
      title: "Get note",
      description: "Read a note by UUID.",
      inputSchema: z.object({ id: z.string().uuid() }),
    },
    async ({ id }) => {
      const note = await getNoteById(memoryDb, clientId, id);
      if (!note) {
        return {
          content: [{ type: "text" as const, text: `Note not found: ${id}` }],
          isError: true,
        };
      }
      return textResult(note);
    },
  );

  server.registerTool(
    "note_put",
    {
      title: "Put note",
      description: "Create or update a note (pass id to update).",
      inputSchema: z.object({
        id: z.string().uuid().optional(),
        title: z.string().nullable().optional(),
        body: z.string().min(1),
        frontmatter: z.record(z.unknown()).optional(),
      }),
    },
    async ({ id, title, body, frontmatter }) => {
      const note = await upsertNote(
        memoryDb,
        clientId,
        { id, title: title ?? null, body, frontmatter: frontmatter ?? {} },
        memoryEnv,
      );
      return textResult({
        id: note.id,
        title: note.title,
        updated_at: note.updated_at,
      });
    },
  );

  server.registerTool(
    "note_link",
    {
      title: "Link notes",
      description: "Create a directed edge between two notes.",
      inputSchema: z.object({
        from_id: z.string().uuid(),
        to_id: z.string().uuid(),
        rel: z.string().min(1),
      }),
    },
    async ({ from_id, to_id, rel }) => {
      const link = await createNoteLink(memoryDb, clientId, from_id, to_id, rel);
      return textResult(link);
    },
  );

  server.registerTool(
    "note_search",
    {
      title: "Search notes",
      description: "Semantic search over note embeddings.",
      inputSchema: z.object({
        query: z.string().min(1),
        top_k: z.number().int().min(1).max(20).optional(),
      }),
    },
    async ({ query, top_k }) =>
      textResult({
        notes: await searchNotes(
          memoryDb,
          clientId,
          query,
          memoryEnv,
          top_k ?? memoryEnv.MEMORY_TOP_K ?? 8,
        ),
      }),
  );

  server.registerTool(
    "note_neighbors",
    {
      title: "Note neighbors",
      description: "Graph traverse from a note id (BFS, depth-limited).",
      inputSchema: z.object({
        id: z.string().uuid(),
        depth: z.number().int().min(1).max(5).optional(),
        include_incoming: z.boolean().optional(),
      }),
    },
    async ({ id, depth, include_incoming }) =>
      textResult({
        neighbors: await getNoteNeighbors(memoryDb, clientId, id, {
          depth,
          includeIncoming: include_incoming,
        }),
      }),
  );

  server.registerTool(
    "note_links",
    {
      title: "Note outgoing links",
      description: "List outgoing edges from a note.",
      inputSchema: z.object({ id: z.string().uuid() }),
    },
    async ({ id }) =>
      textResult({ links: await listNoteLinksFrom(memoryDb, clientId, id) }),
  );
}

export function createOrbitaMcpHandler(deps: OrbitaMcpDeps) {
  return async (request: Request): Promise<Response> => {
    const server = new McpServer({ name: "orbita", version: deps.version });
    registerOrbitaTools(server, deps);

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    return transport.handleRequest(request);
  };
}
