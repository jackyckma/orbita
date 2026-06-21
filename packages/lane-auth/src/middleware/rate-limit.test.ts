import type { ContentfulStatusCode } from "hono/utils/http-status";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  OrbitaError,
  toApiErrorBody,
  type ApiErrorBody,
} from "@orbita/platform";
import type { AuthDb } from "../db/client.js";
import type { ApiKeyRow } from "../db/schema.js";
import type { AuthContext } from "./auth.js";
import {
  createRateLimitMiddleware,
  evaluateFixedWindowRateLimit,
  getFixedWindowStart,
  getRetryAfterSeconds,
  type IncrementRateLimitCounter,
} from "./rate-limit.js";

function createApiKeyRow(input: {
  id: string;
  rateLimitPerMinute?: number | null;
}): ApiKeyRow {
  return {
    id: input.id,
    keyPrefix: "orb_test",
    keyHash: "hash",
    allowedClientIds: ["client-a"],
    scopes: ["sessions:use"],
    expiresAt: null,
    revokedAt: null,
    rateLimitPerMinute: input.rateLimitPerMinute ?? null,
    createdAt: new Date("2026-06-21T00:00:00.000Z"),
  };
}

function createInMemoryIncrementCounter(): IncrementRateLimitCounter {
  const counters = new Map<string, number>();
  return async (keyId, windowStart) => {
    const mapKey = `${keyId}:${windowStart.toISOString()}`;
    const next = (counters.get(mapKey) ?? 0) + 1;
    counters.set(mapKey, next);
    return next;
  };
}

function createApp(input: {
  authResolver: (request: Request) => AuthContext;
  defaultRateLimitPerMinute: number;
  now: () => Date;
  incrementCounter: IncrementRateLimitCounter;
}) {
  const app = new Hono<{ Variables: { auth: AuthContext } }>();
  app.onError((err, c) => {
    if (err instanceof OrbitaError) {
      return c.json(
        toApiErrorBody(err, "req-test"),
        err.status as ContentfulStatusCode,
      );
    }
    throw err;
  });
  app.use("*", async (c, next) => {
    c.set("auth", input.authResolver(c.req.raw));
    await next();
  });
  app.use(
    "*",
    createRateLimitMiddleware({
      authDb: {} as AuthDb,
      defaultRateLimitPerMinute: input.defaultRateLimitPerMinute,
      now: input.now,
      incrementCounter: input.incrementCounter,
    }),
  );
  return app;
}

describe("rate-limit helpers", () => {
  it("buckets timestamps to minute window start", () => {
    const now = new Date("2026-06-21T22:28:45.678Z");
    expect(getFixedWindowStart(now).toISOString()).toBe(
      "2026-06-21T22:28:00.000Z",
    );
  });

  it("allows count at limit and limits count over limit", () => {
    const now = new Date("2026-06-21T22:28:45.000Z");
    const windowStart = getFixedWindowStart(now);
    expect(
      evaluateFixedWindowRateLimit({
        count: 2,
        limit: 2,
        now,
        windowStart,
      }).isLimited,
    ).toBe(false);
    expect(
      evaluateFixedWindowRateLimit({
        count: 3,
        limit: 2,
        now,
        windowStart,
      }).isLimited,
    ).toBe(true);
  });

  it("computes retry-after seconds until next window", () => {
    const windowStart = new Date("2026-06-21T22:28:00.000Z");
    expect(
      getRetryAfterSeconds(new Date("2026-06-21T22:28:00.000Z"), windowStart),
    ).toBe(60);
    expect(
      getRetryAfterSeconds(new Date("2026-06-21T22:28:30.100Z"), windowStart),
    ).toBe(30);
    expect(
      getRetryAfterSeconds(new Date("2026-06-21T22:28:59.999Z"), windowStart),
    ).toBe(1);
  });
});

describe("createRateLimitMiddleware", () => {
  it("calls next under limit and returns 429 with retry-after over limit", async () => {
    let routeCalls = 0;
    const app = createApp({
      authResolver: () => ({
        apiKey: createApiKeyRow({ id: "00000000-0000-0000-0000-000000000001" }),
        clientId: "client-a",
      }),
      defaultRateLimitPerMinute: 2,
      now: () => new Date("2026-06-21T22:28:10.000Z"),
      incrementCounter: createInMemoryIncrementCounter(),
    });
    app.get("/v1/test", (c) => {
      routeCalls += 1;
      return c.json({ ok: true }, 200);
    });

    const first = await app.request("http://localhost/v1/test");
    const second = await app.request("http://localhost/v1/test");
    const third = await app.request("http://localhost/v1/test");
    const thirdBody = (await third.json()) as ApiErrorBody;

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.headers.get("Retry-After")).toBe("50");
    expect(thirdBody.error.code).toBe("rate_limited");
    expect(routeCalls).toBe(2);
  });

  it("tracks counters independently per key and honors per-key limit override", async () => {
    const app = createApp({
      authResolver: (request) => {
        const keyId = request.headers.get("x-key-id") ?? "key-a";
        if (keyId === "key-a") {
          return {
            apiKey: createApiKeyRow({
              id: "00000000-0000-0000-0000-00000000000a",
              rateLimitPerMinute: 1,
            }),
            clientId: "client-a",
          };
        }
        return {
          apiKey: createApiKeyRow({
            id: "00000000-0000-0000-0000-00000000000b",
          }),
          clientId: "client-a",
        };
      },
      defaultRateLimitPerMinute: 3,
      now: () => new Date("2026-06-21T22:28:20.000Z"),
      incrementCounter: createInMemoryIncrementCounter(),
    });
    app.get("/v1/test", (c) => c.json({ ok: true }, 200));

    const keyAFirst = await app.request("http://localhost/v1/test", {
      headers: { "x-key-id": "key-a" },
    });
    const keyASecond = await app.request("http://localhost/v1/test", {
      headers: { "x-key-id": "key-a" },
    });
    const keyBFirst = await app.request("http://localhost/v1/test", {
      headers: { "x-key-id": "key-b" },
    });
    const keyBSecond = await app.request("http://localhost/v1/test", {
      headers: { "x-key-id": "key-b" },
    });

    expect(keyAFirst.status).toBe(200);
    expect(keyASecond.status).toBe(429);
    expect(keyBFirst.status).toBe(200);
    expect(keyBSecond.status).toBe(200);
  });
});
