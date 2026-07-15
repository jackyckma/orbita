import { z } from "zod";

export const OAuthEnvSchema = z.object({
  ORBITA_PUBLIC_BASE_URL: z.string().url().optional(),
  ORBITA_SECRETS_KEY: z.string().min(16),
  ORBITA_MCP_OAUTH_DEFAULT_CLIENT_ID: z.string().min(1).default("personal-jacky"),
});

export type OAuthEnv = z.infer<typeof OAuthEnvSchema>;

export function loadOAuthEnv(
  processEnv: NodeJS.ProcessEnv = process.env,
): OAuthEnv {
  return OAuthEnvSchema.parse({
    ORBITA_PUBLIC_BASE_URL: processEnv.ORBITA_PUBLIC_BASE_URL,
    ORBITA_SECRETS_KEY: processEnv.ORBITA_SECRETS_KEY,
    ORBITA_MCP_OAUTH_DEFAULT_CLIENT_ID:
      processEnv.ORBITA_MCP_OAUTH_DEFAULT_CLIENT_ID,
  });
}

export type OAuthRuntimeConfig = {
  issuer: string;
  mcpResource: string;
  prmUrl: string;
  asMetadataUrl: string;
  defaultOrbitaClientId: string;
  signingSecret: string;
  scopes: string[];
};

export function buildOAuthConfig(
  env: OAuthEnv,
  publicBaseUrl: string,
): OAuthRuntimeConfig {
  const issuer = env.ORBITA_PUBLIC_BASE_URL ?? publicBaseUrl;
  const mcpResource = `${issuer.replace(/\/$/, "")}/v1/mcp`;
  return {
    issuer: issuer.replace(/\/$/, ""),
    mcpResource,
    prmUrl: `${issuer.replace(/\/$/, "")}/.well-known/oauth-protected-resource`,
    asMetadataUrl: `${issuer.replace(/\/$/, "")}/.well-known/oauth-authorization-server`,
    defaultOrbitaClientId: env.ORBITA_MCP_OAUTH_DEFAULT_CLIENT_ID,
    signingSecret: env.ORBITA_SECRETS_KEY,
    scopes: ["sessions:use"],
  };
}
