import { and, eq, gt, isNull } from "drizzle-orm";
import { badRequest, unauthorized } from "@orbita/platform";
import type { AuthDb } from "@orbita/auth";
import {
  findActiveApiKeyByPlaintext,
  isClientIdAllowed,
} from "@orbita/auth";
import type { OAuthDb } from "../db/client.js";
import { oauthAuthorizationCodes } from "../db/schema.js";
import { randomToken } from "../jwt.js";
import { verifyPkceS256 } from "../pkce.js";
import { getOAuthClient, redirectUriAllowed } from "./register.js";

const CODE_TTL_MS = 10 * 60 * 1000;

export type AuthorizeParams = {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  scope?: string;
  state?: string;
  code_challenge: string;
  code_challenge_method?: string;
};

export function parseAuthorizeParams(
  query: Record<string, string | undefined>,
): AuthorizeParams {
  const response_type = query.response_type ?? "";
  const client_id = query.client_id ?? "";
  const redirect_uri = query.redirect_uri ?? "";
  const code_challenge = query.code_challenge ?? "";
  const code_challenge_method = query.code_challenge_method ?? "S256";

  if (response_type !== "code") {
    throw badRequest("Unsupported response_type");
  }
  if (!client_id || !redirect_uri || !code_challenge) {
    throw badRequest("Missing required OAuth parameters");
  }
  if (code_challenge_method !== "S256") {
    throw badRequest("Only S256 code_challenge_method is supported");
  }

  return {
    response_type,
    client_id,
    redirect_uri,
    scope: query.scope,
    state: query.state,
    code_challenge,
    code_challenge_method,
  };
}

export async function validateAuthorizeRequest(
  oauthDb: OAuthDb,
  params: AuthorizeParams,
) {
  const client = await getOAuthClient(oauthDb, params.client_id);
  if (!client) throw unauthorized("Unknown OAuth client");
  if (!redirectUriAllowed(client, params.redirect_uri)) {
    throw badRequest("Invalid redirect_uri");
  }
  return client;
}

export async function approveAuthorization(
  oauthDb: OAuthDb,
  authDb: AuthDb,
  params: AuthorizeParams,
  apiKeyPlaintext: string,
  orbitaClientId: string,
): Promise<string> {
  await validateAuthorizeRequest(oauthDb, params);

  const apiKey = await findActiveApiKeyByPlaintext(authDb, apiKeyPlaintext.trim());
  if (!apiKey) throw unauthorized("Invalid API key");

  if (!isClientIdAllowed(apiKey, orbitaClientId)) {
    throw unauthorized("API key is not allowed for this client_id");
  }

  if (!apiKey.scopes.includes("sessions:use")) {
    throw unauthorized("API key missing sessions:use scope");
  }

  const code = randomToken(24);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  const scope = params.scope?.trim() || "sessions:use";

  await oauthDb.db.insert(oauthAuthorizationCodes).values({
    code,
    oauthClientId: params.client_id,
    redirectUri: params.redirect_uri,
    orbitaClientId,
    scope,
    codeChallenge: params.code_challenge,
    codeChallengeMethod: params.code_challenge_method ?? "S256",
    expiresAt,
  });

  const url = new URL(params.redirect_uri);
  url.searchParams.set("code", code);
  if (params.state) url.searchParams.set("state", params.state);
  return url.toString();
}

export async function consumeAuthorizationCode(
  oauthDb: OAuthDb,
  code: string,
  clientId: string,
  redirectUri: string,
  codeVerifier: string,
) {
  const [row] = await oauthDb.db
    .select()
    .from(oauthAuthorizationCodes)
    .where(
      and(
        eq(oauthAuthorizationCodes.code, code),
        eq(oauthAuthorizationCodes.oauthClientId, clientId),
        eq(oauthAuthorizationCodes.redirectUri, redirectUri),
        isNull(oauthAuthorizationCodes.usedAt),
        gt(oauthAuthorizationCodes.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) throw unauthorized("Invalid authorization code");

  if (!verifyPkceS256(codeVerifier, row.codeChallenge)) {
    throw unauthorized("Invalid PKCE code_verifier");
  }

  await oauthDb.db
    .update(oauthAuthorizationCodes)
    .set({ usedAt: new Date() })
    .where(eq(oauthAuthorizationCodes.code, code));

  return row;
}
