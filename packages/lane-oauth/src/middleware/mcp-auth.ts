import { createMiddleware } from "hono/factory";
import {
  extractBearerToken,
  findActiveApiKeyByPlaintext,
  getAuth,
  isClientIdAllowed,
  type AuthContext,
  type AuthDb,
} from "@orbita/auth";
import { forbidden, OrbitaError, unauthorized } from "@orbita/platform";
import type { OAuthRuntimeConfig } from "../config.js";
import { verifyAccessToken } from "../jwt.js";

export type McpAuthContext = AuthContext & {
  authMethod: "api_key" | "oauth";
};

function mcpUnauthorizedChallenge(config: OAuthRuntimeConfig): OrbitaError {
  return new OrbitaError(
    "unauthorized",
    "OAuth authorization required",
    401,
    undefined,
    {
      "WWW-Authenticate": `Bearer realm="orbita", resource_metadata="${config.prmUrl}"`,
    },
  );
}

export function createMcpAuthMiddleware(
  authDb: AuthDb,
  config: OAuthRuntimeConfig,
) {
  return createMiddleware<{ Variables: { auth: McpAuthContext } }>(
    async (c, next) => {
      const token = extractBearerToken(c.req.header("authorization"));
      if (!token) {
        throw mcpUnauthorizedChallenge(config);
      }

      const oauthClaims = verifyAccessToken(
        token,
        config.signingSecret,
        config.mcpResource,
      );
      if (oauthClaims) {
        const scopes = oauthClaims.scope.split(/\s+/).filter(Boolean);
        if (!scopes.includes("sessions:use")) {
          throw forbidden("Missing required scope: sessions:use");
        }
        c.set("auth", {
          authMethod: "oauth",
          clientId: oauthClaims.sub,
          apiKey: {
            id: "oauth",
            keyPrefix: "oauth",
            keyHash: "",
            allowedClientIds: [oauthClaims.sub],
            scopes,
            rateLimitPerMinute: null,
            expiresAt: null,
            revokedAt: null,
            createdAt: new Date(),
          },
        });
        await next();
        return;
      }

      const apiKey = await findActiveApiKeyByPlaintext(authDb, token);
      if (!apiKey) {
        throw mcpUnauthorizedChallenge(config);
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

      c.set("auth", { authMethod: "api_key", apiKey, clientId });
      await next();
    },
  );
}

export function requireMcpScope(scope: string) {
  return createMiddleware<{ Variables: { auth: McpAuthContext } }>(
    async (c, next) => {
      const auth = getAuth(c);
      if (!auth.apiKey.scopes.includes(scope)) {
        throw forbidden(`Missing required scope: ${scope}`);
      }
      await next();
    },
  );
}