import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ApiErrorBodySchema,
  badRequest,
  forbidden,
  notFound,
} from "@orbita/platform";
import type { AuthDb } from "../db/client.js";
import {
  API_KEY_LABEL_MAX_LENGTH,
  createApiKey,
  listApiKeys,
  patchApiKey,
  revokeApiKey,
} from "../services/api-keys.js";

const optionalLabelSchema = z
  .string()
  .max(API_KEY_LABEL_MAX_LENGTH)
  .optional()
  .transform((v) => (v === undefined ? undefined : v.trim() === "" ? null : v.trim()));

const optionalPurposeSchema = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : v.trim() === "" ? null : v.trim()));

const CreateApiKeyBodySchema = z
  .object({
    allowed_client_ids: z.array(z.string().min(1)).min(1),
    scopes: z.array(z.string().min(1)).default(["sessions:create", "sessions:use"]),
    label: optionalLabelSchema,
    purpose: optionalPurposeSchema,
    expires_at: z.string().datetime().optional(),
    rate_limit_per_minute: z.number().int().positive().optional(),
  })
  .openapi("CreateApiKeyBody");

const CreateApiKeyResponseSchema = z
  .object({
    id: z.string().uuid(),
    key: z.string(),
    key_prefix: z.string(),
    label: z.string().nullable(),
    purpose: z.string().nullable(),
    allowed_client_ids: z.array(z.string()),
    scopes: z.array(z.string()),
    expires_at: z.string().datetime().nullable(),
    rate_limit_per_minute: z.number().int().positive().nullable().optional(),
    created_at: z.string().datetime(),
  })
  .openapi("CreateApiKeyResponse");

const ApiKeySummarySchema = z.object({
  id: z.string().uuid(),
  key_prefix: z.string(),
  label: z.string().nullable(),
  purpose: z.string().nullable(),
  unlabelled: z.boolean(),
  allowed_client_ids: z.array(z.string()),
  scopes: z.array(z.string()),
  expires_at: z.string().datetime().nullable(),
  rate_limit_per_minute: z.number().nullable(),
  created_at: z.string().datetime(),
  revoked_at: z.string().datetime().nullable(),
  suspended_at: z.string().datetime().nullable(),
  state: z.enum(["active", "expired", "revoked", "suspended"]),
});

const PatchApiKeyBodySchema = z
  .object({
    label: optionalLabelSchema,
    purpose: optionalPurposeSchema,
    suspended: z.boolean().optional(),
  })
  .refine(
    (body) =>
      body.label !== undefined ||
      body.purpose !== undefined ||
      body.suspended !== undefined,
    {
      message: "At least one of label, purpose, or suspended is required",
    },
  )
  .openapi("PatchApiKeyBody");

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

/** @deprecated Prefer admin middleware; guard optional when middleware is used */
export function optionalAdminGuard(
  guard: AdminAuthGuard | undefined,
  headerToken: string | undefined,
): void {
  if (guard) {
    guard(headerToken);
  }
}

export function createAdminRoutes(
  authDb: AuthDb,
  guard?: AdminAuthGuard,
): OpenAPIHono {
  const app = new OpenAPIHono();

  const createKeyRoute = createRoute({
    method: "post",
    path: "/api-keys",
    tags: ["Admin"],
    summary: "Create a pre-issued API key",
    request: {
      headers: z.object({
        "x-orbita-admin-token": z.string().optional(),
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
    optionalAdminGuard(guard, c.req.header("x-orbita-admin-token"));

    const body = c.req.valid("json");
    let expiresAt: Date | null = null;
    if (body.expires_at) {
      if (!body.expires_at.endsWith("Z")) {
        throw badRequest("expires_at must be ISO-8601 UTC ending with Z");
      }
      expiresAt = new Date(body.expires_at);
      if (Number.isNaN(expiresAt.getTime())) {
        throw badRequest("Invalid expires_at");
      }
    }

    const result = await createApiKey(authDb, {
      allowedClientIds: body.allowed_client_ids,
      scopes: body.scopes,
      label: body.label ?? null,
      purpose: body.purpose ?? null,
      expiresAt,
      rateLimitPerMinute: body.rate_limit_per_minute ?? null,
    });

    return c.json(
      {
        id: result.id,
        key: result.plaintextKey,
        key_prefix: result.keyPrefix,
        label: result.label,
        purpose: result.purpose,
        allowed_client_ids: result.allowedClientIds,
        scopes: result.scopes,
        expires_at: result.expiresAt,
        rate_limit_per_minute: result.rateLimitPerMinute,
        created_at: result.createdAt,
      },
      201,
    );
  });

  const patchKeyRoute = createRoute({
    method: "patch",
    path: "/api-keys/{key_id}",
    tags: ["Admin"],
    summary: "Update API key label or purpose",
    request: {
      headers: z.object({
        "x-orbita-admin-token": z.string().optional(),
      }),
      params: RevokeApiKeyParamsSchema,
      body: {
        content: {
          "application/json": {
            schema: PatchApiKeyBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: "Updated key metadata",
        content: {
          "application/json": {
            schema: ApiKeySummarySchema,
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
      404: {
        description: "Key not found",
        content: { "application/json": { schema: ApiErrorBodySchema } },
      },
    },
  });

  app.openapi(patchKeyRoute, async (c) => {
    optionalAdminGuard(guard, c.req.header("x-orbita-admin-token"));
    const { key_id } = c.req.valid("param");
    const body = c.req.valid("json");
    const updated = await patchApiKey(authDb, key_id, {
      label: body.label,
      purpose: body.purpose,
      suspended: body.suspended,
    });
    if (!updated) {
      throw notFound("API key not found");
    }
    return c.json(updated, 200);
  });

  const revokeKeyRoute = createRoute({
    method: "delete",
    path: "/api-keys/{key_id}",
    tags: ["Admin"],
    summary: "Revoke an API key",
    request: {
      headers: z.object({
        "x-orbita-admin-token": z.string().optional(),
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
    optionalAdminGuard(guard, c.req.header("x-orbita-admin-token"));
    const { key_id } = c.req.valid("param");
    const revoked = await revokeApiKey(authDb, key_id);
    if (!revoked) {
      throw notFound("API key not found or already revoked");
    }
    return c.body(null, 204);
  });

  const listKeysRoute = createRoute({
    method: "get",
    path: "/api-keys",
    tags: ["Admin"],
    summary: "List API keys (metadata only)",
    responses: {
      200: {
        description: "API key list",
        content: {
          "application/json": {
            schema: z.object({
              keys: z.array(ApiKeySummarySchema),
            }),
          },
        },
      },
    },
  });

  app.openapi(listKeysRoute, async (c) => {
    optionalAdminGuard(guard, c.req.header("x-orbita-admin-token"));
    const keys = await listApiKeys(authDb);
    return c.json({ keys }, 200);
  });

  return app;
}
