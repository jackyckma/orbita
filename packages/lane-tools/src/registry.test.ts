import { describe, expect, it } from "vitest";
import {
  executeToolCall,
  listRegisteredTools,
  type ToolTraceEvent,
} from "./registry.js";

describe("tool registry", () => {
  it("lists nine tools", () => {
    expect(listRegisteredTools()).toEqual([
      "echo",
      "http_get",
      "http_post",
      "json_parse",
      "json_stringify",
      "hash_sha256",
      "uuid_v4",
      "memory_put",
      "memory_get",
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

  it("memory_put and memory_get", async () => {
    const store = new Map<string, string>();
    const ctx = {
      clientId: "test",
      resolveCredential: async () => "unused",
      putMemory: async (key: string, content: string) => {
        store.set(key, content);
      },
      getMemory: async (key: string) => store.get(key) ?? null,
    };
    const put = await executeToolCall(
      "memory_put",
      JSON.stringify({ key: "drafts/pending/a", content: "hello" }),
      ["memory_put"],
      ctx,
    );
    expect(put.success).toBe(true);
    const got = await executeToolCall(
      "memory_get",
      JSON.stringify({ key: "drafts/pending/a" }),
      ["memory_get"],
      ctx,
    );
    expect(got.success).toBe(true);
    expect((got.result as { content: string }).content).toBe("hello");
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
