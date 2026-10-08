/**
 * Stateless Streamable HTTP shapes against createOrbitaMcpHandler.
 * Status and JSON-RPC error body are the contract: which client shapes
 * the v1 transport rejects before a tool list is returned.
 */
import { describe, expect, it } from "vitest";
import { createOrbitaMcpHandler } from "./index.js";
import { minimalMcpDeps } from "./mcp-test-helpers.js";

const URL_MCP = "https://api.get-orbita.com/v1/mcp";
const ACCEPT_BOTH = "application/json, text/event-stream";

function handler() {
  return createOrbitaMcpHandler(minimalMcpDeps());
}

function initMessage(protocolVersion = "2025-11-25") {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: "shape-test", version: "0" },
    },
  };
}

function toolsListMessage(id: number | string = 2) {
  return {
    jsonrpc: "2.0",
    id,
    method: "tools/list",
  };
}

function post(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(URL_MCP, {
    method: "POST",
    headers: {
      accept: ACCEPT_BOTH,
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function send(request: Request): Promise<{
  status: number;
  contentType: string | null;
  body: string;
}> {
  const response = await handler()(request);
  const body = await response.text();
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    body,
  };
}

function rpcError(body: string): { code?: number; message?: string } {
  const parsed = JSON.parse(body) as {
    error?: { code?: number; message?: string };
  };
  return parsed.error ?? {};
}

describe("stateless MCP HTTP shapes", () => {
  it("initialize with protocolVersion and header 2025-11-25 returns 200", async () => {
    const res = await send(
      post(initMessage("2025-11-25"), {
        "mcp-protocol-version": "2025-11-25",
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toContain("2025-11-25");
    expect(res.body).toContain("orbita");
  });

  it("tools/list on a fresh transport without initialize returns the tool list", async () => {
    const res = await send(post(toolsListMessage()));
    expect(res.status).toBe(200);
    expect(res.body).toContain("orbita_whoami");
  });

  it("tools/list carrying an Mcp-Session-Id is accepted in stateless mode", async () => {
    const res = await send(
      post(toolsListMessage(), {
        "mcp-session-id": "not-a-session-this-server-issued",
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toContain("orbita_whoami");
  });

  it("Accept: application/json only is 406, not 400", async () => {
    const res = await send(
      post(toolsListMessage(), { accept: "application/json" }),
    );
    expect(res.status).toBe(406);
    expect(rpcError(res.body).message).toContain("application/json");
    expect(rpcError(res.body).message).toContain("text/event-stream");
    expect(rpcError(res.body).code).toBe(-32000);
  });

  it("Accept: text/event-stream only is 406, not 400", async () => {
    const res = await send(
      post(toolsListMessage(), { accept: "text/event-stream" }),
    );
    expect(res.status).toBe(406);
    expect(rpcError(res.body).code).toBe(-32000);
    expect(rpcError(res.body).message).toContain("text/event-stream");
  });

  it.each([
    ["2025-03-26"],
    ["2025-06-18"],
    ["2025-11-25"],
  ])("tools/list with MCP-Protocol-Version %s returns 200", async (version) => {
    const res = await send(
      post(toolsListMessage(), { "mcp-protocol-version": version }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toContain("orbita_whoami");
  });

  it("tools/list with a padded 2026-07-28 protocol header is served", async () => {
    const res = await send(
      post(toolsListMessage(), { "mcp-protocol-version": " 2026-07-28 " }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toContain("orbita_whoami");
  });

  it("tools/list with MCP-Protocol-Version 2026-07-28 is served, not 400", async () => {
    const res = await send(
      post(
        {
          jsonrpc: "2.0",
          id: "chatgpt-1",
          method: "tools/list",
          params: {
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientCapabilities": {},
              "io.modelcontextprotocol/clientInfo": {
                name: "chatgpt",
                version: "1.0",
              },
            },
          },
        },
        {
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": "tools/list",
          "user-agent": "ChatGPT",
        },
      ),
    );
    expect(res.status).toBe(200);
    expect(res.body).toContain("orbita_whoami");
  });

  it("unknown MCP-Protocol-Version on a non-initialize request stays 400", async () => {
    const res = await send(
      post(toolsListMessage(), { "mcp-protocol-version": "1999-01-01" }),
    );
    expect(res.status).toBe(400);
    const error = rpcError(res.body);
    expect(error.code).toBe(-32000);
    expect(error.message).toContain("Unsupported protocol version");
    expect(error.message).toContain("1999-01-01");
  });

  it("a one-element JSON-RPC batch containing initialize returns 200", async () => {
    const res = await send(post([initMessage()]));
    expect(res.status).toBe(200);
    expect(res.body).toContain("protocolVersion");
  });

  it("a batch that mixes initialize with another message returns 400", async () => {
    const res = await send(
      post([
        initMessage(),
        { jsonrpc: "2.0", method: "notifications/initialized" },
      ]),
    );
    expect(res.status).toBe(400);
    expect(rpcError(res.body).code).toBe(-32600);
    expect(rpcError(res.body).message).toContain("Only one initialization");
  });

  it("a batch of two tools/list requests returns 200", async () => {
    const res = await send(
      post([toolsListMessage(1), toolsListMessage(2)]),
    );
    expect(res.status).toBe(200);
    expect(res.body).toContain("orbita_whoami");
  });

  it("notifications/initialized on a fresh transport returns 202", async () => {
    const res = await send(
      post({ jsonrpc: "2.0", method: "notifications/initialized" }),
    );
    expect(res.status).toBe(202);
    expect(res.body).toBe("");
  });

  it("initialize sent again on a new request (fresh transport) returns 200", async () => {
    const call = handler();
    const first = await call(post(initMessage()));
    const second = await call(post(initMessage()));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await first.text();
    await second.text();
  });

  it("invalid JSON returns 400 parse error", async () => {
    const res = await send(post("{"));
    expect(res.status).toBe(400);
    expect(rpcError(res.body).code).toBe(-32700);
    expect(rpcError(res.body).message).toContain("Invalid JSON");
  });

  it("a JSON object that is not JSON-RPC returns 400", async () => {
    const res = await send(post({ method: "tools/list", id: 1 }));
    expect(res.status).toBe(400);
    expect(rpcError(res.body).code).toBe(-32700);
    expect(rpcError(res.body).message).toContain("Invalid JSON-RPC");
  });

  it("Content-Type other than application/json returns 415", async () => {
    const res = await send(
      post(toolsListMessage(), { "content-type": "text/plain" }),
    );
    expect(res.status).toBe(415);
    expect(rpcError(res.body).message).toContain("application/json");
  });

  it("tools/list with params null returns 400 invalid JSON-RPC", async () => {
    const res = await send(
      post({ jsonrpc: "2.0", id: 1, method: "tools/list", params: null }),
    );
    expect(res.status).toBe(400);
    expect(rpcError(res.body).code).toBe(-32700);
    expect(rpcError(res.body).message).toContain("Invalid JSON-RPC");
  });

  it("GET with MCP-Protocol-Version 2026-07-28 is not rejected as 400", async () => {
    const response = await handler()(
      new Request(URL_MCP, {
        method: "GET",
        headers: {
          accept: "text/event-stream",
          "mcp-protocol-version": "2026-07-28",
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    await response.body?.cancel();
  });
});
