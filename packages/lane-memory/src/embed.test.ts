import { afterEach, describe, expect, it, vi } from "vitest";
import { loadMemoryEnv } from "./config.js";
import { embedText, formatVectorLiteral } from "./embed.js";

describe("formatVectorLiteral", () => {
  it("joins numbers for pgvector", () => {
    expect(formatVectorLiteral([0.1, -0.2, 0.3])).toBe("[0.1,-0.2,0.3]");
  });
});

describe("embedText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns null without API key", async () => {
    const env = loadMemoryEnv({ MINIMAX_API_KEY: undefined });
    expect(await embedText(env, "hello")).toBeNull();
  });

  it("returns null for blank text", async () => {
    const env = loadMemoryEnv({ MINIMAX_API_KEY: "k" });
    expect(await embedText(env, "   ")).toBeNull();
  });

  it("POSTs MiniMax texts+type body (not OpenAI input)", async () => {
    const vector = Array.from({ length: 1024 }, (_, i) => i / 1024);
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        Response.json({ vectors: [vector], base_resp: { status_code: 0 } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = loadMemoryEnv({
      MINIMAX_API_KEY: "test-key",
      MINIMAX_BASE_URL: "https://api.minimax.io/v1",
      EMBEDDING_MODEL: "embo-01",
      EMBEDDING_DIMENSIONS: "1024",
    });

    const result = await embedText(env, "note body", { purpose: "db" });
    expect(result).toEqual(vector);
    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call!;
    expect(String(url)).toBe("https://api.minimax.io/v1/embeddings");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "embo-01",
      texts: ["note body"],
      type: "db",
    });
  });

  it("uses type=query for search embeddings and optional GroupId", async () => {
    const vector = Array.from({ length: 1024 }, () => 0.01);
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        Response.json({ vectors: [vector], base_resp: { status_code: 0 } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = loadMemoryEnv({
      MINIMAX_API_KEY: "test-key",
      MINIMAX_GROUP_ID: "group-9",
      EMBEDDING_DIMENSIONS: "1024",
    });

    await embedText(env, "find related notes", { purpose: "query" });
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call!;
    expect(String(url)).toBe(
      "https://api.minimax.io/v1/embeddings?GroupId=group-9",
    );
    expect(JSON.parse(String(init?.body)).type).toBe("query");
  });

  it("returns null when vector length mismatches EMBEDDING_DIMENSIONS", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        vectors: [Array.from({ length: 1536 }, () => 0.1)],
        base_resp: { status_code: 0 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = loadMemoryEnv({
      MINIMAX_API_KEY: "test-key",
      EMBEDDING_DIMENSIONS: "1024",
    });
    expect(await embedText(env, "x")).toBeNull();
  });

  it("returns null on MiniMax base_resp error", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        vectors: [],
        base_resp: { status_code: 1004, status_msg: "auth" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = loadMemoryEnv({ MINIMAX_API_KEY: "bad" });
    expect(await embedText(env, "x")).toBeNull();
  });
});
