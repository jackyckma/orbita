import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ApiErrorBodySchema, badRequest, createLogger } from "@orbita/platform";
import { getAuth } from "@orbita/auth";
import type { AdminAuthGuard } from "@orbita/auth";
import type { CredentialsDb } from "../db/client.js";
import {
  createCredential,
  deleteCredential,
  listAllCredentials,
  listCredentials,
  replaceCredentialSecret,
  setCredentialExpiry,
} from "../service.js";

const logger = createLogger(process.env.NODE_ENV ?? "development");

const CredentialMetadataSchema = z.object({
  client_id: z.string(),
  name: z.string(),
  scopes: z.array(z.string()),
  created_at: z.string(),
  rotated_at: z.string().nullable(),
  expires_at: z.string().nullable(),
});

const CredentialMetadataClientSchema = CredentialMetadataSchema.omit({ client_id: true });

function optionalAdminGuard(
  guard: AdminAuthGuard | undefined,
  headerToken: string | undefined,
): void {
  if (guard) {
    guard(headerToken);
  }
}

export function createCredentialAdminRoutes(
  db: CredentialsDb,
  secretsKey: string,
  guard?: AdminAuthGuard,
): OpenAPIHono {
  const app = new OpenAPIHono();

  const createRouteDef = createRoute({
    method: "post",
    path: "/credentials",
    tags: ["Admin"],
    summary: "Store a client credential (write-once)",
    request: {
      headers: z.object({ "x-orbita-admin-token": z.string().optional() }),
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
            schema: CredentialMetadataSchema.omit({
              rotated_at: true,
              expires_at: true,
            }).extend({
              rotated_at: z.string().nullable().optional(),
              expires_at: z.string().nullable().optional(),
            }),
          },
        },
      },
      403: { description: "Forbidden", content: { "application/json": { schema: ApiErrorBodySchema } } },
      409: { description: "Conflict", content: { "application/json": { schema: ApiErrorBodySchema } } },
    },
  });

  app.openapi(createRouteDef, async (c) => {
    optionalAdminGuard(guard, c.req.header("x-orbita-admin-token"));
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
        rotated_at: null,
        expires_at: null,
      },
      201,
    );
  });

  const listAllRoute = createRoute({
    method: "get",
    path: "/credentials",
    tags: ["Admin"],
    summary: "List all stored credentials (metadata only)",
    responses: {
      200: {
        description: "Credential metadata",
        content: {
          "application/json": {
            schema: z.object({
              credentials: z.array(CredentialMetadataSchema),
            }),
          },
        },
      },
    },
  });

  app.openapi(listAllRoute, async (c) => {
    optionalAdminGuard(guard, c.req.header("x-orbita-admin-token"));
    const items = await listAllCredentials(db);
    return c.json({ credentials: items }, 200);
  });

  const credentialByNameParams = z.object({
    client_id: z.string().min(1),
    name: z.string().min(1),
  });

  const replaceRoute = createRoute({
    method: "put",
    path: "/credentials/{client_id}/{name}",
    tags: ["Admin"],
    summary: "Replace secret for an existing credential (rotation)",
    request: {
      headers: z.object({ "x-orbita-admin-token": z.string().optional() }),
      params: credentialByNameParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              secret: z.string().min(1),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Credential rotated",
        content: { "application/json": { schema: CredentialMetadataSchema } },
      },
      404: { description: "Not found", content: { "application/json": { schema: ApiErrorBodySchema } } },
      403: { description: "Forbidden", content: { "application/json": { schema: ApiErrorBodySchema } } },
    },
  });

  app.openapi(replaceRoute, async (c) => {
    optionalAdminGuard(guard, c.req.header("x-orbita-admin-token"));
    const { client_id, name } = c.req.valid("param");
    const { secret } = c.req.valid("json");
    const credential = await replaceCredentialSecret(db, secretsKey, client_id, name, secret);
    logger.info(
      { event: "credential_rotated", client_id, name },
      "credential rotated",
    );
    return c.json(credential, 200);
  });

  const patchExpiryRoute = createRoute({
    method: "patch",
    path: "/credentials/{client_id}/{name}",
    tags: ["Admin"],
    summary: "Set or clear credential expiry",
    request: {
      headers: z.object({ "x-orbita-admin-token": z.string().optional() }),
      params: credentialByNameParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              expires_at: z.string().datetime().nullable(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Expiry updated",
        content: { "application/json": { schema: CredentialMetadataSchema } },
      },
      404: { description: "Not found", content: { "application/json": { schema: ApiErrorBodySchema } } },
      403: { description: "Forbidden", content: { "application/json": { schema: ApiErrorBodySchema } } },
    },
  });

  app.openapi(patchExpiryRoute, async (c) => {
    optionalAdminGuard(guard, c.req.header("x-orbita-admin-token"));
    const { client_id, name } = c.req.valid("param");
    const { expires_at } = c.req.valid("json");
    const expiresAt = expires_at === null ? null : new Date(expires_at);
    const credential = await setCredentialExpiry(db, client_id, name, expiresAt);
    logger.info(
      { event: "credential_expiry_set", client_id, name },
      "credential expiry set",
    );
    return c.json(credential, 200);
  });

  const deleteRoute = createRoute({
    method: "delete",
    path: "/credentials/{client_id}/{name}",
    tags: ["Admin"],
    summary: "Delete a stored credential",
    request: {
      headers: z.object({ "x-orbita-admin-token": z.string().optional() }),
      params: credentialByNameParams,
      query: z.object({
        confirm: z.string().min(1),
      }),
    },
    responses: {
      204: { description: "Deleted" },
      400: { description: "Bad request", content: { "application/json": { schema: ApiErrorBodySchema } } },
      404: { description: "Not found", content: { "application/json": { schema: ApiErrorBodySchema } } },
      403: { description: "Forbidden", content: { "application/json": { schema: ApiErrorBodySchema } } },
    },
  });

  app.openapi(deleteRoute, async (c) => {
    optionalAdminGuard(guard, c.req.header("x-orbita-admin-token"));
    const { client_id, name } = c.req.valid("param");
    const { confirm } = c.req.valid("query");
    if (confirm !== name) {
      throw badRequest("confirm query must match credential name");
    }
    await deleteCredential(db, client_id, name);
    logger.info(
      { event: "credential_deleted", client_id, name },
      "credential deleted",
    );
    return c.body(null, 204);
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
              credentials: z.array(CredentialMetadataClientSchema),
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
