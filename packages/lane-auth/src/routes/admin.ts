import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ApiErrorBodySchema,
  badRequest,
  forbidden,
  notFound,
} from "@orbita/platform";
import type { AuthDb } from "../db/client.js";
import { createApiKey, revokeApiKey } from "../services/api-keys.js";

const CreateApiKeyBodySchema = z
  .object({
    allowed_client_ids: z.array(z.string().min(1)).min(1),
    scopes: z.array(z.string().min(1)).default(["sessions:create", "sessions:use"]),
    expires_at: z.string().datetime().optional(),
    rate_limit_per_minute: z.number().int().positive().optional(),
  })
  .openapi("CreateApiKeyBody");

const CreateApiKeyResponseSchema = z
  .object({
    id: z.string().uuid(),
    key: z.string(),
    key_prefix: z.string(),
    allowed_client_ids: z.array(z.string()),
    scopes: z.array(z.string()),
    expires_at: z.string().datetime().nullable(),
    rate_limit_per_minute: z.number().int().positive().nullable(),
    created_at: z.string().datetime(),
  })
  .openapi("CreateApiKeyResponse");

const RevokeApiKeyParamsSchema = z.object({
  key_id: z.string().uuid(),
});

export type AdminAuthGuard = (adminToken: string | undefined) => void;

export function createAdminAuthGuard(expectedToken: string): AdminAuthGuard {
  return (adminToken) => {
    if (!adminToken || adminToken !== expectedToken) {
      throw forbidden("Invalid admin token");
    }
  };
}

export function createAdminRoutes(
  authDb: AuthDb,
  guard: AdminAuthGuard,
): OpenAPIHono {
  const app = new OpenAPIHono();

  const createKeyRoute = createRoute({
    method: "post",
    path: "/api-keys",
    tags: ["Admin"],
    summary: "Create a pre-issued API key",
    request: {
      headers: z.object({
        "x-orbita-admin-token": z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: CreateApiKeyBodySchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: "API key created — plaintext returned once",
        content: {
          "application/json": {
            schema: CreateApiKeyResponseSchema,
          },
        },
      },
      400: {
        description: "Invalid request",
        content: { "application/json": { schema: ApiErrorBodySchema } },
      },
      403: {
        description: "Forbidden",
        content: { "application/json": { schema: ApiErrorBodySchema } },
      },
    },
  });

  app.openapi(createKeyRoute, async (c) => {
    guard(c.req.header("x-orbita-admin-token"));

    const body = c.req.valid("json");
    let expiresAt: Date | null = null;
    if (body.expires_at) {
      expiresAt = new Date(body.expires_at);
      if (Number.isNaN(expiresAt.getTime())) {
        throw badRequest("Invalid expires_at");
      }
    }

    const result = await createApiKey(authDb, {
      allowedClientIds: body.allowed_client_ids,
      scopes: body.scopes,
      expiresAt,
      rateLimitPerMinute: body.rate_limit_per_minute ?? null,
    });

    return c.json(
      {
        id: result.id,
        key: result.plaintextKey,
        key_prefix: result.keyPrefix,
        allowed_client_ids: result.allowedClientIds,
        scopes: result.scopes,
        expires_at: result.expiresAt,
        rate_limit_per_minute: result.rateLimitPerMinute,
        created_at: result.createdAt,
      },
      201,
    );
  });

  const revokeKeyRoute = createRoute({
    method: "delete",
    path: "/api-keys/{key_id}",
    tags: ["Admin"],
    summary: "Revoke an API key",
    request: {
      headers: z.object({
        "x-orbita-admin-token": z.string(),
      }),
      params: RevokeApiKeyParamsSchema,
    },
    responses: {
      204: { description: "Key revoked" },
      403: {
        description: "Forbidden",
        content: { "application/json": { schema: ApiErrorBodySchema } },
      },
      404: {
        description: "Key not found",
        content: { "application/json": { schema: ApiErrorBodySchema } },
      },
    },
  });

  app.openapi(revokeKeyRoute, async (c) => {
    guard(c.req.header("x-orbita-admin-token"));
    const { key_id } = c.req.valid("param");
    const revoked = await revokeApiKey(authDb, key_id);
    if (!revoked) {
      throw notFound("API key not found or already revoked");
    }
    return c.body(null, 204);
  });

  return app;
}
