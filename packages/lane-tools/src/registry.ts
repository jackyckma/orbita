import { createHash, randomUUID } from "node:crypto";
import type OpenAI from "openai";
import { performHttpRequest } from "./http.js";
import { dockerRunEcho, isDockerSandboxEnabled } from "./sandbox/docker.js";

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
