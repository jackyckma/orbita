import { Hono } from "hono";
import type { AuthDb } from "@orbita/auth";
import { OrbitaError } from "@orbita/platform";
import type { OAuthRuntimeConfig } from "../config.js";
import type { OAuthDb } from "../db/client.js";
import {
  approveAuthorization,
  parseAuthorizeParams,
  validateAuthorizeRequest,
} from "../services/authorize.js";
import { registerOAuthClient } from "../services/register.js";
import {
  exchangeAuthorizationCode,
  refreshAccessToken,
} from "../services/token.js";
import { renderConsentPage } from "./consent-html.js";

export function createOAuthRoutes(deps: {
  oauthDb: OAuthDb;
  authDb: AuthDb;
  config: OAuthRuntimeConfig;
}): Hono {
  const app = new Hono();
  const { oauthDb, authDb, config } = deps;

  app.post("/oauth/register", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) {
      return c.json({ error: "invalid_client_metadata" }, 400);
    }
    try {
      const result = await registerOAuthClient(oauthDb, {
        client_name:
          typeof body.client_name === "string" ? body.client_name : undefined,
        redirect_uris: Array.isArray(body.redirect_uris)
          ? body.redirect_uris.filter((v): v is string => typeof v === "string")
          : undefined,
        grant_types: Array.isArray(body.grant_types)
          ? body.grant_types.filter((v): v is string => typeof v === "string")
          : undefined,
        response_types: Array.isArray(body.response_types)
          ? body.response_types.filter((v): v is string => typeof v === "string")
          : undefined,
        token_endpoint_auth_method:
          typeof body.token_endpoint_auth_method === "string"
            ? body.token_endpoint_auth_method
            : undefined,
      });
      return c.json(result, 201);
    } catch (err) {
      if (err instanceof OrbitaError) {
        return c.json(
          { error: err.code, error_description: err.message },
          err.status as 400,
        );
      }
      throw err;
    }
  });

  app.get("/oauth/authorize", async (c) => {
    try {
      const params = parseAuthorizeParams({
        response_type: c.req.query("response_type"),
        client_id: c.req.query("client_id"),
        redirect_uri: c.req.query("redirect_uri"),
        scope: c.req.query("scope"),
        state: c.req.query("state"),
        code_challenge: c.req.query("code_challenge"),
        code_challenge_method: c.req.query("code_challenge_method"),
      });
      const client = await validateAuthorizeRequest(oauthDb, params);
      return c.html(
        renderConsentPage({
          clientName: client.clientName ?? params.client_id,
          defaultClientId: config.defaultOrbitaClientId,
          params: {
            response_type: params.response_type,
            client_id: params.client_id,
            redirect_uri: params.redirect_uri,
            scope: params.scope ?? "sessions:use",
            state: params.state ?? "",
            code_challenge: params.code_challenge,
            code_challenge_method: params.code_challenge_method ?? "S256",
          },
        }),
      );
    } catch (err) {
      if (err instanceof OrbitaError) {
        return c.html(
          renderConsentPage({
            clientName: "OAuth client",
            defaultClientId: config.defaultOrbitaClientId,
            params: {},
            error: err.message,
          }),
          err.status as 400,
        );
      }
      throw err;
    }
  });

  app.post("/oauth/authorize", async (c) => {
    const form = await c.req.parseBody();
    const get = (key: string) => {
      const value = form[key];
      return typeof value === "string" ? value : "";
    };

    try {
      const params = parseAuthorizeParams({
        response_type: get("response_type"),
        client_id: get("client_id"),
        redirect_uri: get("redirect_uri"),
        scope: get("scope"),
        state: get("state"),
        code_challenge: get("code_challenge"),
        code_challenge_method: get("code_challenge_method"),
      });
      const redirectUrl = await approveAuthorization(
        oauthDb,
        authDb,
        params,
        get("api_key"),
        get("orbita_client_id") || config.defaultOrbitaClientId,
      );
      return c.redirect(redirectUrl, 302);
    } catch (err) {
      if (err instanceof OrbitaError) {
        return c.html(
          renderConsentPage({
            clientName: get("client_id") || "OAuth client",
            defaultClientId: config.defaultOrbitaClientId,
            params: {
              response_type: get("response_type"),
              client_id: get("client_id"),
              redirect_uri: get("redirect_uri"),
              scope: get("scope") || "sessions:use",
              state: get("state"),
              code_challenge: get("code_challenge"),
              code_challenge_method: get("code_challenge_method") || "S256",
            },
            error: err.message,
          }),
          err.status as 401,
        );
      }
      throw err;
    }
  });

  app.post("/oauth/token", async (c) => {
    const contentType = c.req.header("content-type") ?? "";
    let body: Record<string, string | undefined> = {};
    if (contentType.includes("application/json")) {
      const json = (await c.req.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      for (const [key, value] of Object.entries(json)) {
        body[key] = typeof value === "string" ? value : undefined;
      }
    } else {
      const form = await c.req.parseBody();
      for (const [key, value] of Object.entries(form)) {
        body[key] = typeof value === "string" ? value : undefined;
      }
    }

    try {
      const grantType = body.grant_type ?? "";
      const result =
        grantType === "authorization_code"
          ? await exchangeAuthorizationCode(oauthDb, config, body)
          : grantType === "refresh_token"
            ? await refreshAccessToken(oauthDb, config, body)
            : null;
      if (!result) {
        return c.json(
          { error: "unsupported_grant_type", error_description: "Unsupported grant_type" },
          400,
        );
      }
      return c.json(result, 200);
    } catch (err) {
      if (err instanceof OrbitaError) {
        return c.json(
          { error: err.code, error_description: err.message },
          err.status as 401,
        );
      }
      throw err;
    }
  });

  return app;
}
