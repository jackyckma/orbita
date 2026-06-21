import type OpenAI from "openai";

export type ToolExecutionContext = {
  clientId: string;
  resolveCredential: (name: string) => Promise<string>;
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
  execute: async (args, ctx) => {
    const url = String(args.url ?? "");
    if (!url.startsWith("https://")) {
      throw new Error("Only https URLs are allowed");
    }
    const headers: Record<string, string> = {};
    if (args.credential_ref) {
      const secret = await ctx.resolveCredential(String(args.credential_ref));
      headers.Authorization = `Bearer ${secret}`;
    }
    const response = await fetch(url, { headers });
    const body = await response.text();
    return {
      status: response.status,
      ok: response.ok,
      body_preview: body.slice(0, 2000),
    };
  },
};

const registry: Record<string, ToolDefinition> = {
  echo: echoTool,
  http_get: httpGetTool,
};

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
  try {
    const args = JSON.parse(argsJson) as Record<string, unknown>;
    const result = await tool.execute(args, ctx);
    return { success: true, result };
  } catch (err) {
    return {
      success: false,
      result: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function listRegisteredTools(): string[] {
  return Object.keys(registry);
}
