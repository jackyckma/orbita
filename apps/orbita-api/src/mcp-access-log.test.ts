import { describe, expect, it } from "vitest";
import { isMcpAccessLogEnabled, logMcpRequest } from "./mcp-access-log.js";

type LogCall = { obj: Record<string, unknown>; msg: string };

function capture() {
  const calls: LogCall[] = [];
  return {
    calls,
    logger: {
      info(obj: Record<string, unknown>, msg: string) {
        calls.push({ obj, msg });
      },
    },
  };
}

/** Response construction pulls a stream on a later turn. Snapshot after that. */
async function hangingStream(contentType: string) {
  let pulls = 0;
  const response = new Response(
    new ReadableStream({
      pull() {
        pulls += 1;
        return new Promise(() => {});
      },
    }),
    { status: 200, headers: { "content-type": contentType } },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { response, pullCount: () => pulls, baseline: pulls };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://api.get-orbita.com/v1/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("isMcpAccessLogEnabled", () => {
  it("is on unless the flag is the string 0", () => {
    expect(isMcpAccessLogEnabled(undefined)).toBe(true);
    expect(isMcpAccessLogEnabled("1")).toBe(true);
    expect(isMcpAccessLogEnabled("0")).toBe(false);
  });
});

describe("logMcpRequest", () => {
  it("logs the tool count for a successful tools/list and leaves the body readable", async () => {
    const { calls, logger } = capture();
    const response = new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          tools: [
            { name: "do-not-log-tool", description: "desc-secret-do-not-log" },
            { name: "orbita_whoami", inputSchema: { type: "object" } },
          ],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

    await logMcpRequest(logger, {
      requestId: "req-tools",
      request: post(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: { cursor: "cursor-secret-do-not-log" },
        },
        {
          authorization: "Bearer super-secret-token",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2026-07-28",
          "mcp-session-id": "abcdefghijklmnop",
          "user-agent": "ChatGPT",
        },
      ),
      response,
      durationMs: 15,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.msg).toBe("mcp request");
    expect(calls[0]?.obj).toEqual({
      request_id: "req-tools",
      http_method: "POST",
      status: 200,
      jsonrpc_method: "tools/list",
      messages: [{ kind: "result", tool_count: 2 }],
      mcp_protocol_version: "2026-07-28",
      accept: "application/json, text/event-stream",
      content_type: "application/json",
      mcp_session_id_present: true,
      mcp_session_id_prefix: "abcdefgh",
      user_agent: "ChatGPT",
      duration_ms: 15,
    });
    const serialized = JSON.stringify(calls[0]?.obj);
    expect(serialized).not.toContain("super-secret-token");
    expect(serialized).not.toContain("cursor-secret-do-not-log");
    expect(serialized).not.toContain("do-not-log-tool");
    expect(serialized).not.toContain("desc-secret-do-not-log");
    expect(serialized).not.toContain("orbita_whoami");
    expect(serialized).not.toContain("ijklmnop");
    expect(serialized).not.toContain("authorization");
    const replay = (await response.json()) as { result: { tools: unknown[] } };
    expect(replay.result.tools).toHaveLength(2);
  });

  it("logs a JSON-RPC error code when HTTP status is 200", async () => {
    const { calls, logger } = capture();
    const longMessage = `Method not found ${"x".repeat(400)}`;
    await logMcpRequest(logger, {
      requestId: "req-discover",
      request: post({
        jsonrpc: "2.0",
        id: 1,
        method: "server/discover",
        params: { token: "sk-live-do-not-log" },
      }),
      response: new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          error: {
            code: -32601,
            message: longMessage,
            data: { token: "error-data-secret" },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
      durationMs: 4,
      accessLog: "1",
    });

    const messages = calls[0]?.obj.messages as Array<Record<string, unknown>>;
    expect(calls[0]?.obj.status).toBe(200);
    expect(calls[0]?.obj.jsonrpc_method).toBe("server/discover");
    expect(messages).toEqual([
      {
        kind: "error",
        jsonrpc_error_code: -32601,
        jsonrpc_error_message: longMessage.slice(0, 300),
      },
    ]);
    expect(messages[0]?.jsonrpc_error_message).toHaveLength(300);
    const serialized = JSON.stringify(calls[0]?.obj);
    expect(serialized).not.toContain("sk-live-do-not-log");
    expect(serialized).not.toContain("error-data-secret");
    expect(serialized).not.toContain(longMessage);
  });

  it("logs batch method names and per-message outcomes without params", async () => {
    const { calls, logger } = capture();
    await logMcpRequest(logger, {
      requestId: "req-batch",
      request: post([
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { secret: "init-secret" } },
        { jsonrpc: "2.0", id: 2, method: "tools/list", params: { cursor: "batch-cursor-secret" } },
      ]),
      response: new Response(
        JSON.stringify([
          {
            jsonrpc: "2.0",
            id: 1,
            result: { protocolVersion: "2026-07-28", capabilities: { secret: "cap-secret" } },
          },
          {
            jsonrpc: "2.0",
            id: 2,
            result: { tools: [{ name: "hidden-tool" }, { name: "hidden-two" }, { name: "hidden-three" }] },
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
      durationMs: 8,
    });

    expect(calls[0]?.obj.jsonrpc_method).toBe("initialize,tools/list");
    expect(calls[0]?.obj.messages).toEqual([
      { kind: "result" },
      { kind: "result", tool_count: 3 },
    ]);
    const serialized = JSON.stringify(calls[0]?.obj);
    expect(serialized).not.toContain("init-secret");
    expect(serialized).not.toContain("batch-cursor-secret");
    expect(serialized).not.toContain("cap-secret");
    expect(serialized).not.toContain("hidden-tool");
  });

  it("parses SSE data lines and does not consume the original stream", async () => {
    const { calls, logger } = capture();
    const result = {
      jsonrpc: "2.0",
      id: 1,
      result: { tools: [{ name: "sse-tool-secret", description: "sse-desc-secret" }] },
    };
    const error = {
      jsonrpc: "2.0",
      id: 2,
      error: { code: -32601, message: "Method not found", data: "sse-error-secret" },
    };
    const sse = `event: message\ndata: ${JSON.stringify(result)}\n\nevent: message\ndata: ${JSON.stringify(error)}\n\n`;
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sse));
          controller.close();
        },
      }),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );

    await logMcpRequest(logger, {
      requestId: "req-sse",
      request: post([
        { jsonrpc: "2.0", id: 1, method: "tools/list", params: { token: "sse-param-secret" } },
        { jsonrpc: "2.0", id: 2, method: "server/discover" },
      ]),
      response,
      durationMs: 6,
    });

    expect(calls[0]?.obj.messages).toEqual([
      { kind: "result", tool_count: 1 },
      {
        kind: "error",
        jsonrpc_error_code: -32601,
        jsonrpc_error_message: "Method not found",
      },
    ]);
    const serialized = JSON.stringify(calls[0]?.obj);
    expect(serialized).not.toContain("sse-tool-secret");
    expect(serialized).not.toContain("sse-desc-secret");
    expect(serialized).not.toContain("sse-error-secret");
    expect(serialized).not.toContain("sse-param-secret");
    expect(await response.text()).toBe(sse);
  });

  it("never logs secrets, params, or result bodies", async () => {
    const { calls, logger } = capture();
    await logMcpRequest(logger, {
      requestId: "req-secret",
      request: post(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "orbita_whoami", arguments: { token: "sk-live-do-not-log" } },
        },
        {
          authorization: "Bearer super-secret-token",
          "mcp-session-id": "abcdefghijklmnop",
        },
      ),
      response: new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: { content: [{ type: "text", text: "result-body-secret" }] },
          error: {
            code: -32000,
            message: "Bad Request: Unsupported protocol version: 2026-07-28",
            data: "super-secret-token",
          },
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
      durationMs: 3,
    });

    expect(calls[0]?.obj).toMatchObject({
      status: 400,
      jsonrpc_method: "tools/call",
      messages: [
        {
          kind: "error",
          jsonrpc_error_code: -32000,
          jsonrpc_error_message: "Bad Request: Unsupported protocol version: 2026-07-28",
        },
      ],
      mcp_session_id_prefix: "abcdefgh",
    });
    const serialized = JSON.stringify(calls[0]?.obj);
    expect(serialized).not.toContain("super-secret-token");
    expect(serialized).not.toContain("sk-live-do-not-log");
    expect(serialized).not.toContain("result-body-secret");
    expect(serialized).not.toContain("authorization");
    expect(serialized).not.toContain("ijklmnop");
    expect(serialized).not.toContain("arguments");
  });

  it("does not await a GET event-stream body", async () => {
    const stream = await hangingStream("text/event-stream");
    const { response } = stream;
    const { calls, logger } = capture();
    const pending = logMcpRequest(logger, {
      requestId: "req-get",
      request: new Request("https://api.get-orbita.com/v1/mcp", {
        method: "GET",
        headers: {
          accept: "text/event-stream",
          "mcp-protocol-version": "2026-07-28",
          "user-agent": "ChatGPT",
        },
      }),
      response,
      durationMs: 12,
      accessLog: "1",
    });
    const result = await Promise.race([
      pending.then(() => "done" as const),
      new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 200)),
    ]);

    expect(result).toBe("done");
    expect(stream.pullCount()).toBe(stream.baseline);
    expect(response.bodyUsed).toBe(false);
    expect(calls[0]?.obj).toEqual({
      request_id: "req-get",
      http_method: "GET",
      status: 200,
      jsonrpc_method: null,
      messages: [],
      mcp_protocol_version: "2026-07-28",
      accept: "text/event-stream",
      content_type: null,
      mcp_session_id_present: false,
      mcp_session_id_prefix: null,
      user_agent: "ChatGPT",
      duration_ms: 12,
    });
  });

  it("does not log or read bodies when ORBITA_MCP_ACCESS_LOG=0", async () => {
    const stream = await hangingStream("application/json");
    const { response } = stream;
    const { calls, logger } = capture();
    const pending = logMcpRequest(logger, {
      requestId: "req-off",
      request: post(
        { jsonrpc: "2.0", id: 1, method: "tools/list", params: { token: "sk-live-do-not-log" } },
        { authorization: "Bearer super-secret-token" },
      ),
      response,
      durationMs: 1,
      accessLog: "0",
    });
    const result = await Promise.race([
      pending.then(() => "done" as const),
      new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 200)),
    ]);

    expect(result).toBe("done");
    expect(calls).toEqual([]);
    expect(stream.pullCount()).toBe(stream.baseline);
    expect(response.bodyUsed).toBe(false);
  });
});
