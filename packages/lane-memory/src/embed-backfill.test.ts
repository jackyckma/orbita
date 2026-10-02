import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadMemoryEnv } from "./config.js";
import type { MemoryDb } from "./db/client.js";
import { resetEmbedRateLimitBreakerForTests } from "./embed-breaker.js";
import {
  isEmbedBackfillEnabled,
  loadEmbedBackfillConfig,
  resetEmbedBackfillForTests,
  runEmbedBackfillPass,
  startEmbedBackfill,
} from "./embed-backfill.js";

type NoteRow = {
  id: string;
  client_id: string;
  title: string | null;
  body: string;
};

function makeMockDb(initial: NoteRow[]) {
  const embedded = new Set<string>();
  const rows = [...initial];

  const client = vi.fn(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("");
      if (sql.includes("count(*)")) {
        const pending = rows.filter((row) => !embedded.has(row.id));
        return [{ count: pending.length }];
      }
      if (sql.includes("SELECT id")) {
        const limit = Number(values[0]);
        return rows.filter((row) => !embedded.has(row.id)).slice(0, limit);
      }
      return [];
    },
  ) as unknown as MemoryDb["client"];

  client.unsafe = vi.fn(async (_sql: string, params?: unknown[]) => {
    const id = String(params?.[1]);
    embedded.add(id);
  }) as unknown as MemoryDb["client"]["unsafe"];

  return {
    db: { client, db: {} as MemoryDb["db"] } as MemoryDb,
    embedded,
  };
}

describe("embed backfill config", () => {
  it("is disabled unless ORBITA_EMBED_BACKFILL=1", () => {
    expect(isEmbedBackfillEnabled({})).toBe(false);
    expect(isEmbedBackfillEnabled({ ORBITA_EMBED_BACKFILL: "1" })).toBe(true);
    const config = loadEmbedBackfillConfig({
      ORBITA_EMBED_BACKFILL: "1",
      ORBITA_EMBED_BACKFILL_RPM: "6",
      ORBITA_EMBED_BACKFILL_INTERVAL_MINUTES: "15",
    });
    expect(config).toMatchObject({
      enabled: true,
      rpm: 6,
      intervalMinutes: 15,
    });
  });
});

describe("runEmbedBackfillPass", () => {
  beforeEach(() => {
    resetEmbedRateLimitBreakerForTests();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("respects RPM spacing and skips notes that already have embeddings", async () => {
    const vector = Array.from({ length: 1024 }, () => 0.01);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          vectors: [vector],
          base_resp: { status_code: 0 },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          vectors: [vector],
          base_resp: { status_code: 0 },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { db, embedded } = makeMockDb([
      { id: "n1", client_id: "c1", title: "A", body: "one" },
      { id: "n2", client_id: "c1", title: "B", body: "two" },
    ]);

    const sleeps: number[] = [];
    const info = vi.fn();
    const env = loadMemoryEnv({ MINIMAX_API_KEY: "k", EMBEDDING_DIMENSIONS: "1024" });

    const result = await runEmbedBackfillPass(
      db,
      env,
      { info },
      { enabled: true, rpm: 60, intervalMinutes: 10, rateLimitWaitMs: 1000 },
      {
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        delayBetweenEmbedsMs: () => 1000,
      },
    );

    expect(result.processed).toBe(2);
    expect(embedded.has("n1")).toBe(true);
    expect(embedded.has("n2")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([1000]);
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "embedding_backfill_pass",
        processed: 2,
        remaining: 0,
      }),
      "embedding backfill pass complete",
    );
    const blob = JSON.stringify(info.mock.calls);
    expect(blob).not.toContain("one");
    expect(blob).not.toContain("super-secret");
  });

  it("stops on rate limit, waits, and leaves remaining count", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        vectors: [],
        base_resp: { status_code: 1002, status_msg: "rpm" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { db } = makeMockDb([
      { id: "n1", client_id: "c1", title: null, body: "body" },
    ]);

    const sleeps: number[] = [];
    const info = vi.fn();
    const env = loadMemoryEnv({ MINIMAX_API_KEY: "k" });

    const result = await runEmbedBackfillPass(
      db,
      env,
      { info },
      { enabled: true, rpm: 3, intervalMinutes: 10, rateLimitWaitMs: 5000 },
      {
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        delayBetweenEmbedsMs: () => 20_000,
      },
    );

    expect(result.processed).toBe(0);
    expect(result.remaining).toBe(1);
    expect(result.lastReason).toBe("base_resp_error:1002");
    expect(sleeps).toEqual([5000]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("startEmbedBackfill", () => {
  beforeEach(() => {
    resetEmbedRateLimitBreakerForTests();
    resetEmbedBackfillForTests();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    resetEmbedBackfillForTests();
    vi.restoreAllMocks();
  });

  it("does not start interval or fetch when flag is off", () => {
    const intervalSpy = vi.spyOn(globalThis, "setInterval");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { db } = makeMockDb([]);
    startEmbedBackfill(
      db,
      loadMemoryEnv({ MINIMAX_API_KEY: "k" }),
      { info: vi.fn() },
      {},
    );

    expect(intervalSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
