import { Hono } from "hono";
import type { OAuthRuntimeConfig } from "../config.js";

export function createOAuthMetadataRoutes(config: OAuthRuntimeConfig): Hono {
  const app = new Hono();

  app.get("/.well-known/oauth-protected-resource", (c) =>
    c.json(
      {
        resource: config.mcpResource,
        authorization_servers: [config.issuer],
        bearer_methods_supported: ["header"],
        scopes_supported: config.scopes,
      },
      200,
      {
        "Access-Control-Allow-Origin": "*",
      },
    ),
  );

  app.get("/.well-known/oauth-authorization-server", (c) =>
    c.json(
      {
        issuer: config.issuer,
        authorization_endpoint: `${config.issuer}/oauth/authorize`,
        token_endpoint: `${config.issuer}/oauth/token`,
        registration_endpoint: `${config.issuer}/oauth/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        scopes_supported: config.scopes,
      },
      200,
      {
        "Access-Control-Allow-Origin": "*",
      },
    ),
  );

  return app;
}
