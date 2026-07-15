import { and, eq, gt, isNull } from "drizzle-orm";
import { badRequest, unauthorized } from "@orbita/platform";
import type { OAuthRuntimeConfig } from "../config.js";
import type { OAuthDb } from "../db/client.js";
import { oauthRefreshTokens } from "../db/schema.js";
import { hashToken, randomToken, signAccessToken } from "../jwt.js";
import { consumeAuthorizationCode } from "./authorize.js";
import { getOAuthClient } from "./register.js";

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

export async function exchangeAuthorizationCode(
  oauthDb: OAuthDb,
  config: OAuthRuntimeConfig,
  body: Record<string, string | undefined>,
): Promise<TokenResponse> {
  const code = body.code ?? "";
  const redirectUri = body.redirect_uri ?? "";
  const clientId = body.client_id ?? "";
  const codeVerifier = body.code_verifier ?? "";

  if (!code || !redirectUri || !clientId || !codeVerifier) {
    throw badRequest("Missing token request parameters");
  }

  const client = await getOAuthClient(oauthDb, clientId);
  if (!client) throw unauthorized("Unknown OAuth client");

  const authCode = await consumeAuthorizationCode(
    oauthDb,
    code,
    clientId,
    redirectUri,
    codeVerifier,
  );

  return issueTokens(oauthDb, config, {
    oauthClientId: clientId,
    orbitaClientId: authCode.orbitaClientId,
    scope: authCode.scope,
  });
}

export async function refreshAccessToken(
  oauthDb: OAuthDb,
  config: OAuthRuntimeConfig,
  body: Record<string, string | undefined>,
): Promise<TokenResponse> {
  const refreshToken = body.refresh_token ?? "";
  const clientId = body.client_id ?? "";
  if (!refreshToken || !clientId) {
    throw badRequest("Missing refresh_token or client_id");
  }

  const client = await getOAuthClient(oauthDb, clientId);
  if (!client) throw unauthorized("Unknown OAuth client");

  const tokenHash = hashToken(refreshToken);
  const [row] = await oauthDb.db
    .select()
    .from(oauthRefreshTokens)
    .where(
      and(
        eq(oauthRefreshTokens.tokenHash, tokenHash),
        eq(oauthRefreshTokens.oauthClientId, clientId),
        isNull(oauthRefreshTokens.revokedAt),
        gt(oauthRefreshTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) throw unauthorized("Invalid refresh_token");

  await oauthDb.db
    .update(oauthRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(oauthRefreshTokens.id, row.id));

  return issueTokens(oauthDb, config, {
    oauthClientId: clientId,
    orbitaClientId: row.orbitaClientId,
    scope: row.scope,
  });
}

async function issueTokens(
  oauthDb: OAuthDb,
  config: OAuthRuntimeConfig,
  input: {
    oauthClientId: string;
    orbitaClientId: string;
    scope: string;
  },
): Promise<TokenResponse> {
  const ttlSeconds = 3600;
  const accessToken = signAccessToken(
    {
      iss: config.issuer,
      aud: config.mcpResource,
      sub: input.orbitaClientId,
      scope: input.scope,
      client_id: input.oauthClientId,
      ttlSeconds,
    },
    config.signingSecret,
  );

  const refreshToken = randomToken(32);
  await oauthDb.db.insert(oauthRefreshTokens).values({
    tokenHash: hashToken(refreshToken),
    oauthClientId: input.oauthClientId,
    orbitaClientId: input.orbitaClientId,
    scope: input.scope,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ttlSeconds,
    refresh_token: refreshToken,
    scope: input.scope,
  };
}
