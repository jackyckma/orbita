import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadMemoryEnv } from "./config.js";
import {
  resetEmbedRateLimitBreakerForTests,
} from "./embed-breaker.js";
import { setEmbedLogger, type EmbedLogger } from "./embed-log.js";
import {
  embedFailureReason,
  embedText,
  formatVectorLiteral,
  type EmbedFailureReason,
} from "./embed.js";

type WarnCall = { obj: Record<string, unknown>; msg?: string };

function createWarnCapture() {
  const warnCalls: WarnCall[] = [];
  const logger = {
    warn: (obj: object, msg?: string) => {
      warnCalls.push({ obj: obj as Record<string, unknown>, msg });
    },
    info: vi.fn(),
  } as EmbedLogger;
  return { logger, warnCalls };
}

function warnPayload(calls: WarnCall[]): string {
  return JSON.stringify(calls);
}

function lastWarn(calls: WarnCall[]) {
  const last = calls.at(-1);
  expect(last).toBeDefined();
  return last!;
}

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
  let warnCapture: ReturnType<typeof createWarnCapture>;

  beforeEach(() => {
    resetEmbedRateLimitBreakerForTests();
    warnCapture = createWarnCapture();
    setEmbedLogger(warnCapture.logger);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns null without API key and records missing_key", async () => {
    const env = loadMemoryEnv({ MINIMAX_API_KEY: undefined });
    expect(await embedText(env, "hello")).toBeNull();
    expectFailure(embedFailureReason, { reason: "missing_key" });
    const w = lastWarn(warnCapture.warnCalls);
    expect(w.obj.reason).toBe("no_api_key");
    expect(w.msg).toBe("embedding attempt failed");
  });

  it("returns null for blank text and records empty_text", async () => {
    const env = loadMemoryEnv({ MINIMAX_API_KEY: "k" });
    expect(await embedText(env, "   ")).toBeNull();
    expectFailure(embedFailureReason, { reason: "empty_text" });
    expect(lastWarn(warnCapture.warnCalls).obj.reason).toBe("empty_text");
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
    expect(warnCapture.warnCalls).toHaveLength(0);
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
    const w = lastWarn(warnCapture.warnCalls);
    expect(w.obj.reason).toBe("http_status");
    expect(w.obj.http_status).toBe(401);
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
    const w = lastWarn(warnCapture.warnCalls);
    expect(w.obj.reason).toBe("dimension_mismatch");
    expect(w.obj.actual).toBe(1536);
    expect(w.obj.expected).toBe(1024);
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
    const w = lastWarn(warnCapture.warnCalls);
    expect(w.obj.reason).toBe("base_resp_error");
    expect(w.obj.status_code).toBe(1004);
    expect(w.obj.status_msg).toBe("auth");
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
    expect(lastWarn(warnCapture.warnCalls).obj.reason).toBe("no_vector");
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
    const w = lastWarn(warnCapture.warnCalls);
    expect(w.obj.reason).toBe("exception");
    expect(w.obj.error_class).toBe("Error");
    expect(w.obj.message).toBe("fetch failed");
  });

  it("logs no secret, text, or GroupId", async () => {
    const secretKey = "super-secret-minimax-key-xyz";
    const groupId = "my-group-id-42";
    const noteText = "private note body must not leak";

    const fetchMock = vi.fn(async () =>
      Response.json({ error: "nope" }, { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = loadMemoryEnv({
      MINIMAX_API_KEY: secretKey,
      MINIMAX_GROUP_ID: groupId,
      MINIMAX_BASE_URL: "https://api.minimax.io/v1",
    });

    expect(await embedText(env, noteText)).toBeNull();
    expect(warnCapture.warnCalls.length).toBeGreaterThan(0);

    const blob = warnPayload(warnCapture.warnCalls);
    expect(blob).not.toContain(secretKey);
    expect(blob).not.toContain(groupId);
    expect(blob).not.toContain(noteText);
    expect(blob).not.toContain("GroupId=");

    const w = lastWarn(warnCapture.warnCalls);
    expect(w.obj.base_url_host).toBe("api.minimax.io");
    expect(w.obj.group_id_configured).toBe(true);
    const fetchUrl = fetchMock.mock.calls.at(0)?.at(0);
    expect(String(fetchUrl)).toContain("GroupId=");
  });

  it("opens breaker on MiniMax 1002 and short-circuits fetch for 60s", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () =>
      Response.json({
        vectors: [],
        base_resp: { status_code: 1002, status_msg: "rate limit" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = loadMemoryEnv({ MINIMAX_API_KEY: "test-key" });
    expect(await embedText(env, "first")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnCapture.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "embedding_rate_limit_breaker_opened",
      }),
      "embedding rate limit breaker opened",
    );

    expect(await embedText(env, "second")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const w = lastWarn(warnCapture.warnCalls);
    expect(w.obj.reason).toBe("rate_limited_breaker");

    vi.advanceTimersByTime(60_000);
    fetchMock.mockResolvedValueOnce(
      Response.json({
        vectors: [Array.from({ length: 1024 }, () => 0.01)],
        base_resp: { status_code: 0 },
      }),
    );
    expect(await embedText(env, "third")).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warnCapture.logger.info).toHaveBeenCalledWith(
      { event: "embedding_rate_limit_breaker_closed" },
      "embedding rate limit breaker closed",
    );
    vi.useRealTimers();
  });

  it("does not open breaker on HTTP 401", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: "nope" }, { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = loadMemoryEnv({ MINIMAX_API_KEY: "test-key" });
    expect(await embedText(env, "a")).toBeNull();
    expect(await embedText(env, "b")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warnCapture.logger.info).not.toHaveBeenCalled();
  });

  describe("openai_compatible provider", () => {
    it("POSTs OpenAI-style body to EMBEDDING_BASE_URL with optional headers", async () => {
      const vector = Array.from({ length: 1024 }, () => 0.02);
      const fetchMock = vi.fn(
        async (_url: string | URL | Request, _init?: RequestInit) =>
          Response.json({ data: [{ embedding: vector }] }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const env = loadMemoryEnv({
        EMBEDDING_PROVIDER: "openai_compatible",
        EMBEDDING_API_KEY: "or-key",
        EMBEDDING_BASE_URL: "https://openrouter.ai/api/v1",
        EMBEDDING_MODEL: "baai/bge-m3",
        EMBEDDING_HTTP_REFERER: "https://get-orbita.com",
        EMBEDDING_APP_TITLE: "Orbita",
        EMBEDDING_DIMENSIONS: "1024",
      });

      const result = await embedText(env, "note body", { purpose: "query" });
      expect(result).toEqual(vector);
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(String(url)).toBe("https://openrouter.ai/api/v1/embeddings");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer or-key",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://get-orbita.com",
        "X-Title": "Orbita",
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        model: "baai/bge-m3",
        input: "note body",
      });
      const w = warnCapture.warnCalls;
      expect(w).toHaveLength(0);
      const lastInfo = warnCapture.logger.info;
      expect(lastInfo).not.toHaveBeenCalled();
    });

    it("sends dimensions when EMBEDDING_SEND_DIMENSIONS=1", async () => {
      const vector = Array.from({ length: 1024 }, () => 0.01);
      const fetchMock = vi.fn(
        async (_url: string | URL | Request, _init?: RequestInit) =>
          Response.json({ data: [{ embedding: vector }] }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const env = loadMemoryEnv({
        EMBEDDING_PROVIDER: "openai_compatible",
        EMBEDDING_API_KEY: "or-key",
        EMBEDDING_MODEL: "openai/text-embedding-3-small",
        EMBEDDING_SEND_DIMENSIONS: "1",
        EMBEDDING_DIMENSIONS: "1024",
      });

      await embedText(env, "x");
      const call = fetchMock.mock.calls[0];
      expect(call).toBeDefined();
      const init = call![1];
      const body = JSON.parse(String(init?.body));
      expect(body.dimensions).toBe(1024);
    });

    it("returns missing_key without fetch when API key or model is missing", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const noKey = loadMemoryEnv({
        EMBEDDING_PROVIDER: "openai_compatible",
        EMBEDDING_MODEL: "baai/bge-m3",
      });
      expect(await embedText(noKey, "hello")).toBeNull();
      expectFailure(embedFailureReason, { reason: "missing_key" });
      expect(fetchMock).not.toHaveBeenCalled();

      const noModel = loadMemoryEnv({
        EMBEDDING_PROVIDER: "openai_compatible",
        EMBEDDING_API_KEY: "or-key",
      });
      expect(await embedText(noModel, "hello")).toBeNull();
      expectFailure(embedFailureReason, { reason: "missing_key" });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns null on dimension mismatch", async () => {
      const fetchMock = vi.fn(async () =>
        Response.json({
          data: [{ embedding: Array.from({ length: 512 }, () => 0.1) }],
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const env = loadMemoryEnv({
        EMBEDDING_PROVIDER: "openai_compatible",
        EMBEDDING_API_KEY: "or-key",
        EMBEDDING_MODEL: "baai/bge-m3",
        EMBEDDING_DIMENSIONS: "1024",
      });
      expect(await embedText(env, "x")).toBeNull();
      expectFailure(embedFailureReason, {
        reason: "dimension_mismatch",
        actual: 512,
        expected: 1024,
      });
    });

    it("opens breaker on HTTP 429", async () => {
      vi.useFakeTimers();
      const fetchMock = vi.fn(async () =>
        Response.json({ error: { message: "rate limited" } }, { status: 429 }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const env = loadMemoryEnv({
        EMBEDDING_PROVIDER: "openai_compatible",
        EMBEDDING_API_KEY: "or-key",
        EMBEDDING_MODEL: "baai/bge-m3",
      });
      expect(await embedText(env, "first")).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(warnCapture.logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "embedding_rate_limit_breaker_opened",
          provider: "openai_compatible",
        }),
        "embedding rate limit breaker opened",
      );
      expect(await embedText(env, "second")).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it("logs provider host and never secrets or input text", async () => {
      const secretKey = "openrouter-secret-key-abc";
      const noteText = "private corpus line";
      const fetchMock = vi.fn(async () =>
        Response.json({ error: { message: "bad key" } }, { status: 401 }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const env = loadMemoryEnv({
        EMBEDDING_PROVIDER: "openai_compatible",
        EMBEDDING_API_KEY: secretKey,
        EMBEDDING_BASE_URL: "https://openrouter.ai/api/v1",
        EMBEDDING_MODEL: "baai/bge-m3",
      });

      expect(await embedText(env, noteText)).toBeNull();
      const blob = warnPayload(warnCapture.warnCalls);
      expect(blob).not.toContain(secretKey);
      expect(blob).not.toContain(noteText);
      const w = lastWarn(warnCapture.warnCalls);
      expect(w.obj.provider).toBe("openai_compatible");
      expect(w.obj.base_url_host).toBe("openrouter.ai");
      expect(w.obj.model).toBe("baai/bge-m3");
      expect(w.obj.provider_message).toBe("bad key");
    });

    it("does not use MINIMAX_API_KEY when openai_compatible", async () => {
      const fetchMock = vi.fn(
        async (_url: string | URL | Request, _init?: RequestInit) =>
          Response.json({
            data: [{ embedding: Array.from({ length: 1024 }, () => 0) }],
          }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const env = loadMemoryEnv({
        MINIMAX_API_KEY: "minimax-should-not-appear",
        EMBEDDING_PROVIDER: "openai_compatible",
        EMBEDDING_API_KEY: "or-key",
        EMBEDDING_MODEL: "baai/bge-m3",
        EMBEDDING_DIMENSIONS: "1024",
      });
      await embedText(env, "x");
      const call = fetchMock.mock.calls[0];
      expect(call).toBeDefined();
      const init = call![1];
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer or-key",
      });
      expect(String(init?.headers)).not.toContain("minimax-should-not-appear");
    });
  });

  it("does not open breaker on dimension mismatch", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        vectors: [Array.from({ length: 512 }, () => 0.1)],
        base_resp: { status_code: 0 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = loadMemoryEnv({
      MINIMAX_API_KEY: "test-key",
      EMBEDDING_DIMENSIONS: "1024",
    });
    expect(await embedText(env, "a")).toBeNull();
    expect(await embedText(env, "b")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
