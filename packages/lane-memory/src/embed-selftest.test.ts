import { afterEach, describe, expect, it, vi } from "vitest";
import { loadMemoryEnv } from "./config.js";
import { setEmbedLogger } from "./embed-log.js";
import {
  isEmbeddingSelfTestEnabled,
  runEmbeddingSelfTest,
  startEmbeddingSelfTest,
} from "./embed-selftest.js";

function mockLogger() {
  const info = vi.fn();
  const warn = vi.fn();
  const logger = { info, warn };
  return { logger, info, warn };
}

describe("isEmbeddingSelfTestEnabled", () => {
  it("is enabled by default", () => {
    expect(isEmbeddingSelfTestEnabled({})).toBe(true);
  });

  it("is disabled when ORBITA_EMBED_SELFTEST=0", () => {
    expect(isEmbeddingSelfTestEnabled({ ORBITA_EMBED_SELFTEST: "0" })).toBe(
      false,
    );
  });
});

describe("runEmbeddingSelfTest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("logs ok with dims on success", async () => {
    const vector = Array.from({ length: 1024 }, () => 0.01);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ vectors: [vector], base_resp: { status_code: 0 } }),
      ),
    );

    const { logger, info, warn } = mockLogger();
    setEmbedLogger(logger);

    const env = loadMemoryEnv({
      MINIMAX_API_KEY: "test-key",
      EMBEDDING_DIMENSIONS: "1024",
    });

    await runEmbeddingSelfTest(env, logger);
    expect(info).toHaveBeenCalledWith("embedding selftest ok dims=1024");
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs failed reason on embed failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({}, { status: 503 })),
    );

    const { logger, info, warn } = mockLogger();
    setEmbedLogger(logger);

    const env = loadMemoryEnv({ MINIMAX_API_KEY: "test-key" });
    await runEmbeddingSelfTest(env, logger);

    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "embedding selftest failed reason=http_status:503",
    );
  });

  it("logs timeout when embed does not finish in time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise(() => {
            /* never resolves */
          }),
      ),
    );

    const { logger, warn } = mockLogger();
    setEmbedLogger(logger);

    const env = loadMemoryEnv({ MINIMAX_API_KEY: "test-key" });
    await runEmbeddingSelfTest(env, logger, { timeoutMs: 20 });

    expect(warn).toHaveBeenCalledWith(
      "embedding selftest failed reason=exception:Timeout",
    );
  });
});

describe("startEmbeddingSelfTest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not call embed when disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { logger } = mockLogger();
    const env = loadMemoryEnv({ MINIMAX_API_KEY: "test-key" });

    startEmbeddingSelfTest(env, logger, { enabled: false });
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
