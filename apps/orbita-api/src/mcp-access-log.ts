/**
 * Access log for /v1/mcp. One info line per request: method names, and for
 * each JSON-RPC response message whether it is a result or an error.
 * Never log Authorization, tokens, params, tool arguments, or result bodies.
 *
 * GET is not read: Streamable HTTP keeps a long-lived SSE response open, and
 * awaiting that body would stall the client. POST/DELETE bodies are inspected
 * via clone() so the response Hono returns is still readable.
 */

type InfoLogger = {
  info: (obj: Record<string, unknown>, msg: string) => void;
};

export type McpRequestLogInput = {
  requestId: string;
  request: Request;
  response: Response;
  durationMs: number;
  /** `ORBITA_MCP_ACCESS_LOG`. Unset or "1" logs; only "0" skips. */
  accessLog?: string;
};

const SESSION_ID_PREFIX_LEN = 8;
const MESSAGE_MAX = 300;
const METHOD_MAX = 120;
const HEADER_MAX = 300;

type RequestRpc = {
  label: string | null;
  byId: Map<string, string>;
  names: string[];
};

type ParsedMessage = {
  kind: "result" | "error";
  idKey: string | null;
  code: number | null;
  message: string | null;
  tools: unknown;
};

type LoggedMessage =
  | {
      kind: "error";
      jsonrpc_error_code: number | null;
      jsonrpc_error_message: string | null;
    }
  | {
      kind: "result";
      tool_count?: number | null;
    };

/**
 * Explicit "0" / "1" parsing, same enum style as `PlatformEnvSchema`.
 * Default on: only the string "0" disables.
 */
export function isMcpAccessLogEnabled(flag: string | undefined): boolean {
  return flag !== "0";
}

function headerValue(request: Request, name: string): string | null {
  const value = request.headers.get(name);
  if (value === null) return null;
  return value.slice(0, HEADER_MAX);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function idKey(id: unknown): string | null {
  if (typeof id === "string" || typeof id === "number") return `${typeof id}:${id}`;
  return null;
}

function emptyRequest(): RequestRpc {
  return { label: null, byId: new Map(), names: [] };
}

function collectRequest(value: unknown): RequestRpc {
  const items = Array.isArray(value) ? value : [value];
  const names: string[] = [];
  const byId = new Map<string, string>();
  for (const item of items) {
    if (!isRecord(item) || typeof item.method !== "string" || item.method.length === 0) {
      continue;
    }
    const name = item.method.slice(0, METHOD_MAX);
    names.push(name);
    const key = idKey(item.id);
    if (key) byId.set(key, name);
  }
  if (names.length === 0) return { label: null, byId, names };
  return { label: names.join(",").slice(0, METHOD_MAX), byId, names };
}

async function readRequestRpc(request: Request): Promise<RequestRpc> {
  let text: string;
  try {
    text = await request.clone().text();
  } catch {
    return emptyRequest();
  }
  if (!text) return emptyRequest();
  try {
    return collectRequest(JSON.parse(text) as unknown);
  } catch {
    return emptyRequest();
  }
}

function parseMessage(value: unknown): ParsedMessage | null {
  if (!isRecord(value)) return null;
  const key = idKey(value.id);
  if ("error" in value && isRecord(value.error)) {
    const code = typeof value.error.code === "number" ? value.error.code : null;
    const message =
      typeof value.error.message === "string"
        ? value.error.message.slice(0, MESSAGE_MAX)
        : null;
    return { kind: "error", idKey: key, code, message, tools: undefined };
  }
  if ("result" in value) {
    const tools = isRecord(value.result) ? value.result.tools : undefined;
    return { kind: "result", idKey: key, code: null, message: null, tools };
  }
  return null;
}

function looksLikeSse(trimmed: string): boolean {
  return (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("event:") ||
    trimmed.startsWith("id:") ||
    trimmed.startsWith(":")
  );
}

function ssePayloads(text: string): unknown[] {
  const out: unknown[] = [];
  for (const event of text.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .join("\n")
      .trim();
    if (!data || data === "[DONE]") continue;
    try {
      out.push(JSON.parse(data) as unknown);
    } catch {
      // Ignore a malformed event; still log sibling messages.
    }
  }
  return out;
}

function payloadsFrom(text: string, contentType: string): unknown[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const sse =
    contentType.toLowerCase().includes("text/event-stream") || looksLikeSse(trimmed);
  if (sse) {
    const out: unknown[] = [];
    for (const payload of ssePayloads(text)) {
      if (Array.isArray(payload)) out.push(...payload);
      else out.push(payload);
    }
    return out;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function toLogged(message: ParsedMessage, rpc: RequestRpc, messageCount: number): LoggedMessage {
  if (message.kind === "error") {
    return {
      kind: "error",
      jsonrpc_error_code: message.code,
      jsonrpc_error_message: message.message,
    };
  }
  const matched = message.idKey ? rpc.byId.get(message.idKey) : undefined;
  const soleToolsList =
    messageCount === 1 && rpc.names.length === 1 && rpc.names[0] === "tools/list";
  const isToolsList = matched === "tools/list" || (matched === undefined && soleToolsList);
  if (!isToolsList) return { kind: "result" };
  if (!Array.isArray(message.tools)) return { kind: "result", tool_count: null };
  return { kind: "result", tool_count: message.tools.length };
}

async function readResponseMessages(
  response: Response,
  rpc: RequestRpc,
): Promise<LoggedMessage[]> {
  let text: string;
  try {
    text = await response.clone().text();
  } catch {
    return [];
  }
  const contentType = response.headers.get("content-type") ?? "";
  const parsed = payloadsFrom(text, contentType).flatMap((payload) => {
    const message = parseMessage(payload);
    return message ? [message] : [];
  });
  return parsed.map((message) => toLogged(message, rpc, parsed.length));
}

function sessionPrefix(request: Request): {
  present: boolean;
  prefix: string | null;
} {
  const value = request.headers.get("mcp-session-id");
  if (value === null) return { present: false, prefix: null };
  return { present: true, prefix: value.slice(0, SESSION_ID_PREFIX_LEN) };
}

export async function logMcpRequest(
  logger: InfoLogger,
  input: McpRequestLogInput,
): Promise<void> {
  if (!isMcpAccessLogEnabled(input.accessLog)) return;

  const { request, response } = input;
  // GET (including text/event-stream) is long-lived. Log status and headers only.
  const skipBody = request.method === "GET";
  let jsonrpcMethod: string | null = null;
  let messages: LoggedMessage[] = [];
  if (!skipBody) {
    const rpc = await readRequestRpc(request);
    jsonrpcMethod = rpc.label;
    messages = await readResponseMessages(response, rpc);
  }

  const session = sessionPrefix(request);
  logger.info(
    {
      request_id: input.requestId,
      http_method: request.method,
      status: response.status,
      jsonrpc_method: jsonrpcMethod,
      messages,
      mcp_protocol_version: headerValue(request, "mcp-protocol-version"),
      accept: headerValue(request, "accept"),
      content_type: headerValue(request, "content-type"),
      mcp_session_id_present: session.present,
      mcp_session_id_prefix: session.prefix,
      user_agent: headerValue(request, "user-agent"),
      duration_ms: input.durationMs,
    },
    "mcp request",
  );
}
