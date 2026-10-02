import type { OpenAPIHono } from "@hono/zod-openapi";

export const OPENAPI_PRIVATE_PATH_PREFIXES = ["/v1/admin", "/v1/inbound"] as const;

const OPENAPI_CACHE_TTL_MS = 30_000;

export type OpenApiDocConfig = {
  openapi: "3.1.0";
  info: {
    title: string;
    version: string;
    description: string;
  };
};

export function buildOpenApiDocConfig(version: string): OpenApiDocConfig {
  return {
    openapi: "3.1.0",
    info: {
      title: "Orbita API",
      version,
      description: "Agent-native, API-first agent system",
    },
  };
}

export function filterOpenApiDocument<T extends { paths?: Record<string, unknown> }>(
  document: T,
  privatePrefixes: readonly string[] = OPENAPI_PRIVATE_PATH_PREFIXES,
): T {
  if (!document.paths) {
    return document;
  }
  const paths = Object.fromEntries(
    Object.entries(document.paths).filter(
      ([path]) => !privatePrefixes.some((prefix) => path.startsWith(prefix)),
    ),
  );
  return { ...document, paths };
}

type CachedDoc = {
  body: ReturnType<OpenAPIHono["getOpenAPI31Document"]>;
  expiresAt: number;
};

let cachedPublicDoc: CachedDoc | null = null;

export function registerPublicCallerOpenApiRoute(app: OpenAPIHono, version: string): void {
  const config = buildOpenApiDocConfig(version);

  app.get("/v1/openapi.json", (c) => {
    const now = Date.now();
    if (cachedPublicDoc && cachedPublicDoc.expiresAt > now) {
      return c.json(cachedPublicDoc.body);
    }
    const raw = app.getOpenAPI31Document(config);
    const filtered = filterOpenApiDocument(raw);
    cachedPublicDoc = {
      body: filtered,
      expiresAt: now + OPENAPI_CACHE_TTL_MS,
    };
    return c.json(filtered);
  });
}

/** Test helper: clear in-memory OpenAPI cache between cases. */
export function resetPublicOpenApiCache(): void {
  cachedPublicDoc = null;
}
