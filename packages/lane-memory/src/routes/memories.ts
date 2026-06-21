import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ApiErrorBodySchema } from "@orbita/platform";
import { getAuth } from "@orbita/auth";
import type { MemoryDb } from "../db/client.js";
import { listMemories, upsertMemory } from "../service.js";
import type { MemoryEnv } from "../config.js";

export function createMemoryRoutes(
  db: MemoryDb,
  env: MemoryEnv,
): OpenAPIHono {
  const app = new OpenAPIHono();

  const listRoute = createRoute({
    method: "get",
    path: "/memories",
    tags: ["Memory"],
    summary: "List memory keys for the authenticated client",
    responses: {
      200: {
        description: "Memory keys",
        content: {
          "application/json": {
            schema: z.object({
              memories: z.array(
                z.object({
                  key: z.string(),
                  updated_at: z.string(),
                }),
              ),
            }),
          },
        },
      },
    },
  });

  app.openapi(listRoute, async (c) => {
    const auth = getAuth(c);
    const items = await listMemories(db, auth.clientId);
    return c.json({ memories: items }, 200);
  });

  const upsertRoute = createRoute({
    method: "put",
    path: "/memories/{key}",
    tags: ["Memory"],
    summary: "Upsert a client-scoped memory entry",
    request: {
      params: z.object({ key: z.string().min(1) }),
      body: {
        content: {
          "application/json": {
            schema: z.object({ content: z.string().min(1) }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Memory stored",
        content: {
          "application/json": {
            schema: z.object({ key: z.string(), updated_at: z.string() }),
          },
        },
      },
      400: { description: "Bad request", content: { "application/json": { schema: ApiErrorBodySchema } } },
    },
  });

  app.openapi(upsertRoute, async (c) => {
    const auth = getAuth(c);
    const { key } = c.req.valid("param");
    const body = c.req.valid("json");
    await upsertMemory(db, auth.clientId, key, body.content, env);
    return c.json({ key, updated_at: new Date().toISOString() }, 200);
  });

  return app;
}
