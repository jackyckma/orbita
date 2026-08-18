import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { CredentialsDb } from "@orbita/credentials";
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
import { portfolioBrief } from "./portfolio-brief.js";
import { executeTriggerAutomation } from "./trigger-automation.js";

export type OrbitaMcpDeps = {
  clientId: string;
  keyPrefix: string;
  scopes: string[];
  memoryDb: MemoryDb;
  memoryEnv: MemoryEnv;
  credentialsDb: CredentialsDb;
  secretsKey: string;
  version: string;
};

function textResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function registerOrbitaTools(server: McpServer, deps: OrbitaMcpDeps) {
  const { clientId, memoryDb, memoryEnv, credentialsDb, secretsKey } = deps;

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

  server.registerTool(
    "portfolio_brief",
    {
      title: "Portfolio brief",
      description:
        "Structured portfolio hub brief: collected reports per project, staleness findings for overdue collector lines, and sha chains joining repo/deploy reports. Returns JSON only.",
      inputSchema: z.object({
        since: z
          .string()
          .min(1)
          .describe("ISO-8601 inclusive lower bound on report updated_at"),
        until: z
          .string()
          .optional()
          .describe("ISO-8601 exclusive upper bound (default: now UTC)"),
        project: z
          .string()
          .optional()
          .describe("Optional project slug filter (enabled registry projects only)"),
      }),
    },
    async ({ since, until, project }) => {
      try {
        const brief = await portfolioBrief(
          { clientId, memoryDb },
          { since, until, project },
        );
        return textResult(brief);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "portfolio_brief failed";
        return {
          content: [{ type: "text" as const, text: message }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "trigger_automation",
    {
      title: "Trigger Cursor automation",
      description:
        "On-demand nudge for orbita Maker or Checker Cursor Automations (webhook trigger). Writes an audit note.",
      inputSchema: z.object({
        lane: z.enum(["maker", "checker"]),
        reason: z.string().min(1),
      }),
    },
    async ({ lane, reason }) => {
      const result = await executeTriggerAutomation(
        {
          clientId,
          credentialsDb,
          secretsKey,
          memoryDb,
          memoryEnv,
        },
        { lane, reason },
      );

      if (!result.ok) {
        if (result.kind === "credential_missing") {
          return {
            content: [
              {
                type: "text" as const,
                text: `Missing credential: ${result.credential_name}. ${result.message}`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  outcome: result.outcome,
                  note_id: result.note_id,
                  credential_name: result.credential_name,
                  error: result.message,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

      return textResult({
        outcome: result.outcome,
        note_id: result.note_id,
        credential_name: result.credential_name,
        lane,
        reason,
      });
    },
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
