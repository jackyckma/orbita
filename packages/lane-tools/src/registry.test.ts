import { describe, expect, it } from "vitest";
import {
  executeToolCall,
  listRegisteredTools,
  type ToolTraceEvent,
} from "./registry.js";

describe("tool registry", () => {
  it("lists thirteen tools", () => {
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
      "note_put",
      "note_get",
      "note_link",
      "web_search",
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

  it("note_put, note_get, and note_link", async () => {
    type StoredNote = {
      id: string;
      title: string | null;
      body: string;
      frontmatter: Record<string, unknown>;
      updated_at: string;
    };
    const notes = new Map<string, StoredNote>();
    const links: Array<{ from_id: string; to_id: string; rel: string }> = [];
    const ctx = {
      clientId: "test",
      resolveCredential: async () => "unused",
      putNote: async (input: {
        id?: string;
        title?: string | null;
        body: string;
        frontmatter?: Record<string, unknown>;
      }) => {
        const id = input.id ?? "note-1";
        const note: StoredNote = {
          id,
          title: input.title ?? null,
          body: input.body,
          frontmatter: input.frontmatter ?? {},
          updated_at: new Date().toISOString(),
        };
        notes.set(id, note);
        return { id: note.id, title: note.title, updated_at: note.updated_at };
      },
      getNote: async (id: string) => notes.get(id) ?? null,
      linkNotes: async (fromId: string, toId: string, rel: string) => {
        const link = { from_id: fromId, to_id: toId, rel };
        links.push(link);
        return link;
      },
    };
    const put = await executeToolCall(
      "note_put",
      JSON.stringify({ id: "note-1", title: "Rubric", body: "# Rules" }),
      ["note_put"],
      ctx,
    );
    expect(put.success).toBe(true);
    const got = await executeToolCall(
      "note_get",
      JSON.stringify({ id: "note-1" }),
      ["note_get"],
      ctx,
    );
    expect(got.success).toBe(true);
    expect((got.result as { body: string }).body).toBe("# Rules");
    const link = await executeToolCall(
      "note_link",
      JSON.stringify({ from_id: "note-1", to_id: "note-2", rel: "relates_to" }),
      ["note_link"],
      ctx,
    );
    expect(link.success).toBe(true);
    expect(links).toHaveLength(1);
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
