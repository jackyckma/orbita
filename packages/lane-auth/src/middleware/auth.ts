import { createMiddleware } from "hono/factory";
import {
  forbidden,
  unauthorized,
  type OrbitaError,
} from "@orbita/platform";
import type { AuthDb } from "../db/client.js";
import {
  findActiveApiKeyByPlaintext,
  isClientIdAllowed,
} from "../services/api-keys.js";
import type { ApiKeyRow } from "../db/schema.js";

export type AuthContext = {
  apiKey: ApiKeyRow;
  clientId: string;
};

const BEARER_PREFIX = "Bearer ";

export function extractBearerToken(
  authorization: string | undefined,
): string | null {
  if (!authorization?.startsWith(BEARER_PREFIX)) {
    return null;
  }
  const token = authorization.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

export function createAuthMiddleware(authDb: AuthDb) {
  return createMiddleware<{ Variables: { auth: AuthContext } }>(
    async (c, next) => {
      const token = extractBearerToken(c.req.header("authorization"));
      if (!token) {
        throw unauthorized("Missing or invalid Authorization header");
      }

      const apiKey = await findActiveApiKeyByPlaintext(authDb, token);
      if (!apiKey) {
        throw unauthorized("Invalid or expired API key");
      }

      const clientId =
        c.req.header("x-orbita-client-id") ??
        c.req.query("client_id") ??
        undefined;

      if (!clientId) {
        throw unauthorized("Missing client_id (header x-orbita-client-id)");
      }

      if (!isClientIdAllowed(apiKey, clientId)) {
        throw forbidden("client_id not allowed for this API key");
      }

      c.set("auth", { apiKey, clientId });
      await next();
    },
  );
}

export function requireScope(scope: string) {
  return createMiddleware<{ Variables: { auth: AuthContext } }>(
    async (c, next) => {
      const auth = c.get("auth");
      if (!auth.apiKey.scopes.includes(scope)) {
        throw forbidden(`Missing required scope: ${scope}`);
      }
      await next();
    },
  );
}

export function getAuth(c: { get: (key: "auth") => AuthContext }): AuthContext {
  return c.get("auth");
}

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

export type { OrbitaError };
