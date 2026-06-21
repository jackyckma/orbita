import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ApiErrorBodySchema } from "@orbita/platform";
import { getAuth } from "@orbita/auth";
import type { AdminAuthGuard } from "@orbita/auth";
import type { CredentialsDb } from "../db/client.js";
import { createCredential, listCredentials } from "../service.js";

export function createCredentialAdminRoutes(
  db: CredentialsDb,
  secretsKey: string,
  guard: AdminAuthGuard,
): OpenAPIHono {
  const app = new OpenAPIHono();

  const createRouteDef = createRoute({
    method: "post",
    path: "/credentials",
    tags: ["Admin"],
    summary: "Store a client credential (write-once)",
    request: {
      headers: z.object({ "x-orbita-admin-token": z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              client_id: z.string().min(1),
              name: z.string().min(1),
              secret: z.string().min(1),
              scope: z.array(z.string()).default([]),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Credential stored — secret never returned again",
        content: {
          "application/json": {
            schema: z.object({
              name: z.string(),
              client_id: z.string(),
              scopes: z.array(z.string()),
              created_at: z.string(),
            }),
          },
        },
      },
      403: { description: "Forbidden", content: { "application/json": { schema: ApiErrorBodySchema } } },
      409: { description: "Conflict", content: { "application/json": { schema: ApiErrorBodySchema } } },
    },
  });

  app.openapi(createRouteDef, async (c) => {
    guard(c.req.header("x-orbita-admin-token"));
    const body = c.req.valid("json");
    const row = await createCredential(db, secretsKey, {
      clientId: body.client_id,
      name: body.name,
      secret: body.secret,
      scopes: body.scope,
    });
    return c.json(
      {
        name: row.name,
        client_id: row.clientId,
        scopes: row.scopes,
        created_at: row.createdAt.toISOString(),
      },
      201,
    );
  });

  return app;
}

export function createCredentialListRoutes(db: CredentialsDb): OpenAPIHono {
  const app = new OpenAPIHono();

  const listRoute = createRoute({
    method: "get",
    path: "/credentials",
    tags: ["Credentials"],
    summary: "List credential names and scopes for the authenticated client",
    responses: {
      200: {
        description: "Credential metadata only",
        content: {
          "application/json": {
            schema: z.object({
              credentials: z.array(
                z.object({
                  name: z.string(),
                  scopes: z.array(z.string()),
                  created_at: z.string(),
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
    const items = await listCredentials(db, auth.clientId);
    return c.json({ credentials: items }, 200);
  });

  return app;
}
