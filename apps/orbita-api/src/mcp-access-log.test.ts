import { describe, expect, it } from "vitest";
import { logMcpClientError } from "./mcp-access-log.js";

describe("logMcpClientError", () => {
  it("logs status, JSON-RPC error, method, and safe headers", async () => {
    const calls: Array<{ obj: Record<string, unknown>; msg: string }> = [];
    const logger = {
      warn(obj: Record<string, unknown>, msg: string) {
        calls.push({ obj, msg });
      },
    };
    const request = new Request("https://api.get-orbita.com/v1/mcp", {
      method: "POST",
      headers: {
        authorization: "Bearer super-secret-token",
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": "2026-07-28",
        "mcp-session-id": "abcdefghijklmnop",
        "user-agent": "ChatGPT",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "orbita_whoami", arguments: { token: "sk-live-do-not-log" } },
      }),
    });
    const response = new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32000,
          message: "Bad Request: Unsupported protocol version: 2026-07-28",
          data: "super-secret-token",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );

    await logMcpClientError(logger, {
      requestId: "req-1",
      request,
      response,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.msg).toBe("mcp request rejected");
    expect(calls[0]?.obj).toEqual({
      request_id: "req-1",
      status: 400,
      jsonrpc_error_code: -32000,
      jsonrpc_error_message: "Bad Request: Unsupported protocol version: 2026-07-28",
      jsonrpc_method: "tools/call",
      mcp_protocol_version: "2026-07-28",
      accept: "application/json, text/event-stream",
      content_type: "application/json",
      mcp_session_id_present: true,
      mcp_session_id_prefix: "abcdefgh",
      user_agent: "ChatGPT",
    });
    const serialized = JSON.stringify(calls[0]?.obj);
    expect(serialized).not.toContain("super-secret-token");
    expect(serialized).not.toContain("sk-live-do-not-log");
    expect(serialized).not.toContain("authorization");
    expect(serialized).not.toContain("ijklmnop");
  });

  it("logs batch method names and not their params", async () => {
    const calls: Array<Record<string, unknown>> = [];
    await logMcpClientError(
      {
        warn(obj) {
          calls.push(obj);
        },
      },
      {
        requestId: "req-batch",
        request: new Request("https://api.get-orbita.com/v1/mcp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify([
            { jsonrpc: "2.0", id: 1, method: "initialize", params: { secret: "one" } },
            { jsonrpc: "2.0", method: "notifications/initialized" },
          ]),
        }),
        response: new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32600, message: "Invalid Request: Only one initialization request is allowed" },
          }),
          { status: 400 },
        ),
      },
    );
    expect(calls[0]?.jsonrpc_method).toBe("initialize,notifications/initialized");
    expect(JSON.stringify(calls[0])).not.toContain("secret");
  });

  it("logs a null method when the body is not JSON-RPC", async () => {
    const calls: Array<Record<string, unknown>> = [];
    await logMcpClientError(
      {
        warn(obj) {
          calls.push(obj);
        },
      },
      {
        requestId: "req-2",
        request: new Request("https://api.get-orbita.com/v1/mcp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "not-json",
        }),
        response: new Response("nope", { status: 400 }),
      },
    );
    expect(calls[0]).toMatchObject({
      status: 400,
      jsonrpc_error_code: null,
      jsonrpc_error_message: null,
      jsonrpc_method: null,
      mcp_session_id_present: false,
      mcp_session_id_prefix: null,
    });
  });
});
