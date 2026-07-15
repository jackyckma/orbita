import { eq } from "drizzle-orm";
import { badRequest } from "@orbita/platform";
import type { OAuthDb } from "../db/client.js";
import { oauthClients } from "../db/schema.js";
import { randomToken } from "../jwt.js";

export type RegisterClientInput = {
  client_name?: string;
  redirect_uris?: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
};

function isAllowedRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export async function registerOAuthClient(
  oauthDb: OAuthDb,
  input: RegisterClientInput,
) {
  const redirectUris = (input.redirect_uris ?? []).filter(isAllowedRedirectUri);
  if (redirectUris.length === 0) {
    throw badRequest("At least one valid redirect_uri is required");
  }

  const clientId = randomToken(16);
  const grantTypes = input.grant_types ?? ["authorization_code", "refresh_token"];
  const responseTypes = input.response_types ?? ["code"];
  const authMethod = input.token_endpoint_auth_method ?? "none";

  await oauthDb.db.insert(oauthClients).values({
    clientId,
    clientName: input.client_name ?? null,
    redirectUris,
    grantTypes,
    responseTypes,
    tokenEndpointAuthMethod: authMethod,
    clientSecretHash: null,
  });

  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: input.client_name,
    redirect_uris: redirectUris,
    grant_types: grantTypes,
    response_types: responseTypes,
    token_endpoint_auth_method: authMethod,
  };
}

export async function getOAuthClient(oauthDb: OAuthDb, clientId: string) {
  const [row] = await oauthDb.db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.clientId, clientId))
    .limit(1);
  return row ?? null;
}

export function redirectUriAllowed(
  client: typeof oauthClients.$inferSelect,
  redirectUri: string,
): boolean {
  return client.redirectUris.includes(redirectUri);
}
