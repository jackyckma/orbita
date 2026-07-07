import { createHash, randomUUID } from "node:crypto";
import type OpenAI from "openai";
import { performHttpRequest } from "./http.js";
import { dockerRunEcho, isDockerSandboxEnabled } from "./sandbox/docker.js";
import { performWebSearch } from "./web-search.js";

export type ToolTraceEvent = {
  phase: "start" | "complete";
  tool_name: string;
  args?: Record<string, unknown>;
  success?: boolean;
  error?: string;
  duration_ms?: number;
};

export type ToolExecutionContext = {
  clientId: string;
  resolveCredential: (name: string) => Promise<string>;
  putMemory?: (key: string, content: string) => Promise<void>;
  getMemory?: (key: string) => Promise<string | null>;
  putNote?: (input: {
    id?: string;
    title?: string | null;
    body: string;
    frontmatter?: Record<string, unknown>;
  }) => Promise<{ id: string; title: string | null; updated_at: string }>;
  getNote?: (id: string) => Promise<{
    id: string;
    title: string | null;
    body: string;
    frontmatter: Record<string, unknown>;
    updated_at: string;
  } | null>;
  linkNotes?: (fromId: string, toId: string, rel: string) => Promise<{
    from_id: string;
    to_id: string;
    rel: string;
  }>;
  onToolTrace?: (event: ToolTraceEvent) => void;
};

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (
    args: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ) => Promise<unknown>;
};

function sanitizeArgsForTrace(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (/secret|token|password|credential/i.test(key)) {
      out[key] = "[REDACTED]";
    } else {
      out[key] = value;
    }
  }
  return out;
}

const echoTool: ToolDefinition = {
  name: "echo",
  description: "Echo back the provided text unchanged.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to echo" },
    },
    required: ["text"],
  },
  execute: async (args) => ({ echoed: String(args.text ?? "") }),
};

const httpGetTool: ToolDefinition = {
  name: "http_get",
  description:
    "Perform an HTTP GET request. Optionally attach Authorization from a stored credential reference.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "HTTPS URL to fetch" },
      credential_ref: {
        type: "string",
        description: "Optional credential name for Authorization: Bearer header",
      },
    },
    required: ["url"],
  },
  execute: async (args, ctx) =>
    performHttpRequest({
      url: String(args.url ?? ""),
      method: "GET",
      credentialRef: args.credential_ref ? String(args.credential_ref) : undefined,
      resolveCredential: ctx.resolveCredential,
    }),
};

const httpPostTool: ToolDefinition = {
  name: "http_post",
  description:
    "Perform an HTTP POST with a JSON or text body. Optionally attach Authorization from credential_ref.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "HTTPS URL" },
      body: {
        description: "Request body (string or JSON object)",
      },
      credential_ref: {
        type: "string",
        description: "Optional credential name for Authorization: Bearer header",
      },
    },
    required: ["url", "body"],
  },
  execute: async (args, ctx) => {
    const body =
      typeof args.body === "string"
        ? args.body
        : JSON.stringify(args.body ?? {});
    const headers: Record<string, string> = {};
    if (typeof args.body !== "string") {
      headers["Content-Type"] = "application/json";
    }
    return performHttpRequest({
      url: String(args.url ?? ""),
      method: "POST",
      body,
      headers,
      credentialRef: args.credential_ref ? String(args.credential_ref) : undefined,
      resolveCredential: ctx.resolveCredential,
    });
  },
};

const jsonParseTool: ToolDefinition = {
  name: "json_parse",
  description: "Parse a JSON string into a structured object.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "JSON text to parse" },
    },
    required: ["text"],
  },
  execute: async (args) => {
    const parsed = JSON.parse(String(args.text ?? ""));
    return { parsed };
  },
};

const jsonStringifyTool: ToolDefinition = {
  name: "json_stringify",
  description: "Serialize a JSON object to a compact string.",
  parameters: {
    type: "object",
    properties: {
      value: { description: "JSON-serializable value" },
      pretty: {
        type: "boolean",
        description: "Pretty-print with indentation",
      },
    },
    required: ["value"],
  },
  execute: async (args) => {
    const pretty = Boolean(args.pretty);
    const text = pretty
      ? JSON.stringify(args.value, null, 2)
      : JSON.stringify(args.value);
    return { text };
  },
};

const hashSha256Tool: ToolDefinition = {
  name: "hash_sha256",
  description: "Return the SHA-256 hex digest of UTF-8 text.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to hash" },
    },
    required: ["text"],
  },
  execute: async (args) => ({
    digest: createHash("sha256").update(String(args.text ?? ""), "utf8").digest("hex"),
  }),
};

const uuidV4Tool: ToolDefinition = {
  name: "uuid_v4",
  description: "Generate a random UUID v4.",
  parameters: {
    type: "object",
    properties: {},
  },
  execute: async () => ({ uuid: randomUUID() }),
};

const memoryPutTool: ToolDefinition = {
  name: "memory_put",
  description:
    "Store or update a client-scoped memory entry by key. Use for drafts, campaign state, or facts the agent should recall later.",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "Memory key (e.g. drafts/pending/uuid)" },
      content: { type: "string", description: "Text content to store" },
    },
    required: ["key", "content"],
  },
  execute: async (args, ctx) => {
    if (!ctx.putMemory) {
      throw new Error("Memory write is not configured for this deployment");
    }
    const key = String(args.key ?? "").trim();
    const content = String(args.content ?? "");
    if (!key) {
      throw new Error("key is required");
    }
    if (!content) {
      throw new Error("content is required");
    }
    await ctx.putMemory(key, content);
    return { key, stored: true };
  },
};

const webSearchTool: ToolDefinition = {
  name: "web_search",
  description:
    "Search the public web for practitioner articles and ideas. Returns titles, URLs, and snippets. Default backend: self-hosted SearXNG (ORBITA_SEARXNG_BASE_URL). Optional Tavily via ORBITA_WEB_SEARCH_PROVIDER=tavily and vault tavily_search.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query (English)" },
      max_results: {
        type: "number",
        description: "Max results (1–10, default 5)",
      },
      credential_ref: {
        type: "string",
        description: "Tavily only — credential name (default tavily_search)",
      },
    },
    required: ["query"],
  },
  execute: async (args, ctx) =>
    performWebSearch({
      query: String(args.query ?? ""),
      maxResults: args.max_results !== undefined ? Number(args.max_results) : undefined,
      credentialRef: args.credential_ref ? String(args.credential_ref) : undefined,
      resolveCredential: ctx.resolveCredential,
    }),
};

const memoryGetTool: ToolDefinition = {
  name: "memory_get",
  description: "Read a client-scoped memory entry by exact key.",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "Memory key to read" },
    },
    required: ["key"],
  },
  execute: async (args, ctx) => {
    if (!ctx.getMemory) {
      throw new Error("Memory read is not configured for this deployment");
    }
    const key = String(args.key ?? "").trim();
    if (!key) {
      throw new Error("key is required");
    }
    const content = await ctx.getMemory(key);
    return { key, content, found: content !== null };
  },
};

const notePutTool: ToolDefinition = {
  name: "note_put",
  description:
    "Create or update a markdown note with optional YAML frontmatter. Use for long-form knowledge, rubrics, or linked prose.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string", description: "Note UUID (omit to create a new note)" },
      title: { type: "string", description: "Optional note title" },
      body: { type: "string", description: "Markdown body" },
      frontmatter: {
        type: "object",
        description: "Optional YAML frontmatter as JSON object",
      },
    },
    required: ["body"],
  },
  execute: async (args, ctx) => {
    if (!ctx.putNote) {
      throw new Error("Note write is not configured for this deployment");
    }
    const body = String(args.body ?? "");
    if (!body) {
      throw new Error("body is required");
    }
    const id = args.id !== undefined ? String(args.id).trim() : undefined;
    const title =
      args.title !== undefined && args.title !== null
        ? String(args.title)
        : undefined;
    const frontmatter =
      args.frontmatter && typeof args.frontmatter === "object" && !Array.isArray(args.frontmatter)
        ? (args.frontmatter as Record<string, unknown>)
        : undefined;
    const note = await ctx.putNote({ id, title, body, frontmatter });
    return { id: note.id, title: note.title, stored: true, updated_at: note.updated_at };
  },
};

const noteGetTool: ToolDefinition = {
  name: "note_get",
  description: "Read a markdown note by id.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string", description: "Note UUID" },
    },
    required: ["id"],
  },
  execute: async (args, ctx) => {
    if (!ctx.getNote) {
      throw new Error("Note read is not configured for this deployment");
    }
    const id = String(args.id ?? "").trim();
    if (!id) {
      throw new Error("id is required");
    }
    const note = await ctx.getNote(id);
    return {
      id,
      found: note !== null,
      title: note?.title ?? null,
      body: note?.body ?? null,
      frontmatter: note?.frontmatter ?? {},
      updated_at: note?.updated_at ?? null,
    };
  },
};

const noteLinkTool: ToolDefinition = {
  name: "note_link",
  description: "Create a directed link between two notes (e.g. relates_to, rejected_because).",
  parameters: {
    type: "object",
    properties: {
      from_id: { type: "string", description: "Source note UUID" },
      to_id: { type: "string", description: "Target note UUID" },
      rel: { type: "string", description: "Relationship label" },
    },
    required: ["from_id", "to_id", "rel"],
  },
  execute: async (args, ctx) => {
    if (!ctx.linkNotes) {
      throw new Error("Note linking is not configured for this deployment");
    }
    const fromId = String(args.from_id ?? "").trim();
    const toId = String(args.to_id ?? "").trim();
    const rel = String(args.rel ?? "").trim();
    if (!fromId || !toId || !rel) {
      throw new Error("from_id, to_id, and rel are required");
    }
    const link = await ctx.linkNotes(fromId, toId, rel);
    return { linked: true, ...link };
  },
};

const dockerEchoTool: ToolDefinition = {
  name: "docker_echo",
  description:
    "Run echo inside an isolated Docker container (requires ORBITA_SANDBOX_DOCKER=1 and Docker socket).",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to echo inside the container" },
    },
    required: ["text"],
  },
  execute: async (args) => {
    if (!isDockerSandboxEnabled()) {
      throw new Error("Docker sandbox is disabled (set ORBITA_SANDBOX_DOCKER=1)");
    }
    return dockerRunEcho(String(args.text ?? ""));
  },
};

const registry: Record<string, ToolDefinition> = {
  echo: echoTool,
  http_get: httpGetTool,
  http_post: httpPostTool,
  json_parse: jsonParseTool,
  json_stringify: jsonStringifyTool,
  hash_sha256: hashSha256Tool,
  uuid_v4: uuidV4Tool,
  memory_put: memoryPutTool,
  memory_get: memoryGetTool,
  note_put: notePutTool,
  note_get: noteGetTool,
  note_link: noteLinkTool,
  web_search: webSearchTool,
};

if (isDockerSandboxEnabled()) {
  registry.docker_echo = dockerEchoTool;
}

export function getToolDefinitions(
  allowedTools: string[],
): OpenAI.ChatCompletionTool[] {
  return allowedTools
    .filter((name) => registry[name])
    .map((name) => {
      const tool = registry[name]!;
      return {
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      };
    });
}

export function getAnthropicToolDefinitions(
  allowedTools: string[],
): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  return allowedTools
    .filter((name) => registry[name])
    .map((name) => {
      const tool = registry[name]!;
      return {
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      };
    });
}

export async function executeToolCall(
  name: string,
  argsJson: string,
  allowedTools: string[],
  ctx: ToolExecutionContext,
): Promise<{ success: boolean; result: unknown; error?: string }> {
  if (!allowedTools.includes(name)) {
    return { success: false, result: null, error: `Tool not allowed: ${name}` };
  }
  const tool = registry[name];
  if (!tool) {
    return { success: false, result: null, error: `Unknown tool: ${name}` };
  }

  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson) as Record<string, unknown>;
  } catch {
    return { success: false, result: null, error: "Invalid tool arguments JSON" };
  }

  const traceArgs = sanitizeArgsForTrace(args);
  const started = Date.now();
  if (ctx.onToolTrace) {
    ctx.onToolTrace({ phase: "start", tool_name: name, args: traceArgs });
  }

  try {
    const result = await tool.execute(args, ctx);
    if (ctx.onToolTrace) {
      ctx.onToolTrace({
        phase: "complete",
        tool_name: name,
        args: traceArgs,
        success: true,
        duration_ms: Date.now() - started,
      });
    }
    return { success: true, result };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    if (ctx.onToolTrace) {
      ctx.onToolTrace({
        phase: "complete",
        tool_name: name,
        args: traceArgs,
        success: false,
        error,
        duration_ms: Date.now() - started,
      });
    }
    return { success: false, result: null, error };
  }
}

export function listRegisteredTools(): string[] {
  return Object.keys(registry);
}
