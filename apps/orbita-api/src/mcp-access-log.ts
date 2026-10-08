/**
 * Safe 4xx detail for POST/GET /v1/mcp. Never log credentials, the
 * Authorization header, or JSON-RPC params (tool arguments).
 */

type WarnLogger = {
  warn: (obj: Record<string, unknown>, msg: string) => void;
};

export type McpClientErrorInput = {
  requestId: string;
  request: Request;
  response: Response;
};

const SESSION_ID_PREFIX_LEN = 8;
const MESSAGE_MAX = 300;
const METHOD_MAX = 120;
const HEADER_MAX = 300;

function headerValue(request: Request, name: string): string | null {
  const value = request.headers.get(name);
  if (value === null) return null;
  return value.slice(0, HEADER_MAX);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonRpcMethod(value: unknown): string | null {
  if (Array.isArray(value)) {
    const names = value.flatMap((item) => {
      const name = jsonRpcMethod(item);
      return name ? [name] : [];
    });
    if (names.length === 0) return null;
    return names.join(",").slice(0, METHOD_MAX);
  }
  if (isRecord(value) && typeof value.method === "string" && value.method.length > 0) {
    return value.method.slice(0, METHOD_MAX);
  }
  return null;
}

async function readJsonRpcMethod(request: Request): Promise<string | null> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return null;
  }
  if (!text) return null;
  try {
    return jsonRpcMethod(JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

function errorFromParsed(value: unknown): { code: number | null; message: string | null } {
  if (!isRecord(value) || !isRecord(value.error)) {
    return { code: null, message: null };
  }
  const code = typeof value.error.code === "number" ? value.error.code : null;
  const message =
    typeof value.error.message === "string"
      ? value.error.message.slice(0, MESSAGE_MAX)
      : null;
  return { code, message };
}

async function readJsonRpcError(
  response: Response,
): Promise<{ code: number | null; message: string | null }> {
  let text: string;
  try {
    text = await response.clone().text();
  } catch {
    return { code: null, message: null };
  }
  if (!text) return { code: null, message: null };
  const payload = text.trimStart().startsWith("data:")
    ? text
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trim())
        .find((line) => line.startsWith("{"))
    : text;
  if (!payload) return { code: null, message: null };
  try {
    return errorFromParsed(JSON.parse(payload) as unknown);
  } catch {
    return { code: null, message: null };
  }
}

function sessionPrefix(request: Request): {
  present: boolean;
  prefix: string | null;
} {
  const value = request.headers.get("mcp-session-id");
  if (value === null) return { present: false, prefix: null };
  return { present: true, prefix: value.slice(0, SESSION_ID_PREFIX_LEN) };
}

export async function logMcpClientError(
  logger: WarnLogger,
  input: McpClientErrorInput,
): Promise<void> {
  const { request, response } = input;
  const [method, error] = await Promise.all([
    readJsonRpcMethod(request),
    readJsonRpcError(response),
  ]);
  const session = sessionPrefix(request);
  logger.warn(
    {
      request_id: input.requestId,
      status: response.status,
      jsonrpc_error_code: error.code,
      jsonrpc_error_message: error.message,
      jsonrpc_method: method,
      mcp_protocol_version: headerValue(request, "mcp-protocol-version"),
      accept: headerValue(request, "accept"),
      content_type: headerValue(request, "content-type"),
      mcp_session_id_present: session.present,
      mcp_session_id_prefix: session.prefix,
      user_agent: headerValue(request, "user-agent"),
    },
    "mcp request rejected",
  );
}
