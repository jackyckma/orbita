import { afterEach, describe, expect, it, vi } from "vitest";
import { loadMemoryEnv } from "./config.js";
import {
  embedFailureReason,
  embedText,
  formatVectorLiteral,
  type EmbedFailureReason,
} from "./embed.js";

function expectFailure(
  actual: EmbedFailureReason | null,
  expected: EmbedFailureReason,
) {
  expect(actual).toEqual(expected);
}

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

  it("returns null without API key and records missing_key", async () => {
    const env = loadMemoryEnv({ MINIMAX_API_KEY: undefined });
    expect(await embedText(env, "hello")).toBeNull();
    expectFailure(embedFailureReason, { reason: "missing_key" });
  });

  it("returns null for blank text and records empty_text", async () => {
    const env = loadMemoryEnv({ MINIMAX_API_KEY: "k" });
    expect(await embedText(env, "   ")).toBeNull();
    expectFailure(embedFailureReason, { reason: "empty_text" });
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
    expect(embedFailureReason).toBeNull();
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

  it("returns null on HTTP error and records httpStatus", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: "unauthorized" }, { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = loadMemoryEnv({ MINIMAX_API_KEY: "test-key" });
    expect(await embedText(env, "x")).toBeNull();
    expectFailure(embedFailureReason, {
      reason: "http_error",
      httpStatus: 401,
    });
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
    expectFailure(embedFailureReason, {
      reason: "dimension_mismatch",
      actual: 1536,
      expected: 1024,
    });
  });

  it("returns null on MiniMax base_resp error with status details", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        vectors: [],
        base_resp: { status_code: 1004, status_msg: "auth" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = loadMemoryEnv({ MINIMAX_API_KEY: "bad" });
    expect(await embedText(env, "x")).toBeNull();
    expectFailure(embedFailureReason, {
      reason: "minimax_status",
      statusCode: 1004,
      statusMsg: "auth",
    });
  });

  it("returns null when response has no vector and records no_vector", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        vectors: [],
        base_resp: { status_code: 0 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = loadMemoryEnv({ MINIMAX_API_KEY: "test-key" });
    expect(await embedText(env, "x")).toBeNull();
    expectFailure(embedFailureReason, { reason: "no_vector" });
  });

  it("returns null when vectors[0] is empty and records no_vector", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        vectors: [[]],
        base_resp: { status_code: 0 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = loadMemoryEnv({ MINIMAX_API_KEY: "test-key" });
    expect(await embedText(env, "x")).toBeNull();
    expectFailure(embedFailureReason, { reason: "no_vector" });
  });

  it("returns null on network error and records network_error", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("fetch failed");
    });
    vi.stubGlobal("fetch", fetchMock);

    const env = loadMemoryEnv({ MINIMAX_API_KEY: "test-key" });
    expect(await embedText(env, "x")).toBeNull();
    expectFailure(embedFailureReason, {
      reason: "network_error",
      detail: "fetch failed",
    });
  });
});
