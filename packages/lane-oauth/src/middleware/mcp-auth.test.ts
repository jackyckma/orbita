import { describe, expect, it, vi, afterEach } from "vitest";
import { Hono } from "hono";
import {
  createErrorHandler,
  createLogger,
  keySuspended,
  requestIdMiddleware,
} from "@orbita/platform";
import * as authModule from "@orbita/auth";
import type { OAuthRuntimeConfig } from "../config.js";
import { createMcpAuthMiddleware } from "./mcp-auth.js";

const oauthConfig: OAuthRuntimeConfig = {
  issuer: "https://api.example",
  signingSecret: "test-secret",
  mcpResource: "https://api.example/mcp",
  prmUrl: "https://api.example/.well-known/oauth-protected-resource",
  asMetadataUrl: "https://api.example/.well-known/oauth-authorization-server",
  defaultOrbitaClientId: "default-client",
  scopes: ["sessions:use"],
};

function mcpApp() {
  const app = new Hono();
  const logger = createLogger("test");
  app.onError(createErrorHandler(logger));
  app.use("*", requestIdMiddleware);
  app.use("*", createMcpAuthMiddleware({ db: {} } as never, oauthConfig));
  app.get("/mcp", (c) => c.json({ ok: true }));
  return app;
}

describe("createMcpAuthMiddleware", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects suspended API keys with key_suspended", async () => {
    vi.spyOn(authModule, "resolveApiKeyBearerToken").mockRejectedValue(
      keySuspended(),
    );
    const res = await mcpApp().request("http://localhost/mcp", {
      headers: {
        Authorization: "Bearer orb_secret",
        "x-orbita-client-id": "client-a",
      },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("key_suspended");
  });
});
