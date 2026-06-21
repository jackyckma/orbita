import { describe, expect, it } from "vitest";
import {
  executeToolCall,
  listRegisteredTools,
  type ToolTraceEvent,
} from "./registry.js";

describe("tool registry", () => {
  it("lists seven tools", () => {
    expect(listRegisteredTools()).toEqual([
      "echo",
      "http_get",
      "http_post",
      "json_parse",
      "json_stringify",
      "hash_sha256",
      "uuid_v4",
    ]);
  });

  it("runs echo", async () => {
    const result = await executeToolCall(
      "echo",
      JSON.stringify({ text: "hello" }),
      ["echo"],
      { clientId: "test", resolveCredential: async () => "unused" },
    );
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ echoed: "hello" });
  });

  it("rejects disallowed tools", async () => {
    const result = await executeToolCall(
      "http_get",
      JSON.stringify({ url: "https://example.com" }),
      ["echo"],
      { clientId: "test", resolveCredential: async () => "unused" },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("not allowed");
  });

  it("json_parse and json_stringify round-trip", async () => {
    const ctx = { clientId: "test", resolveCredential: async () => "unused" };
    const parsed = await executeToolCall(
      "json_parse",
      JSON.stringify({ text: '{"a":1}' }),
      ["json_parse"],
      ctx,
    );
    expect(parsed.success).toBe(true);
    const stringified = await executeToolCall(
      "json_stringify",
      JSON.stringify({ value: { a: 1 }, pretty: false }),
      ["json_stringify"],
      ctx,
    );
    expect(stringified.success).toBe(true);
    expect((stringified.result as { text: string }).text).toBe('{"a":1}');
  });

  it("emits tool trace events", async () => {
    const events: ToolTraceEvent[] = [];
    await executeToolCall(
      "uuid_v4",
      "{}",
      ["uuid_v4"],
      {
        clientId: "test",
        resolveCredential: async () => "unused",
        onToolTrace: (event) => events.push(event),
      },
    );
    expect(events.map((e) => e.phase)).toEqual(["start", "complete"]);
    expect(events[1]?.success).toBe(true);
  });
});
