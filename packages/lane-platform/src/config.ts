import { z } from "zod";

export const PlatformEnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("127.0.0.1"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().url().optional(),
  ORBITA_ADMIN_TOKEN: z.string().min(1).optional(),
  ORBITA_SECRETS_KEY: z.string().min(16).optional(),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  ORBITA_HTTP_ALLOWED_DOMAINS: z.string().optional(),
  ORBITA_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  ORBITA_WEB_SEARCH_PROVIDER: z.enum(["searxng", "tavily"]).default("searxng"),
  ORBITA_SEARXNG_BASE_URL: z.string().url().optional(),
  ORBITA_PUBLIC_BASE_URL: z.string().url().optional(),
  ORBITA_SANDBOX_DOCKER: z.enum(["0", "1"]).optional(),
  ORBITA_INBOUND_EMAIL_TOKEN: z.string().min(16).optional(),
  ORBITA_INBOUND_CLIENT_ID: z.string().min(1).optional(),
  ORBITA_INBOUND_AGENT_PROFILE: z.string().min(1).optional(),
  ORBITA_INSTANCE_FROM_EMAIL: z.string().email().optional(),
  /** 0 = unlimited. Rolling 24h window per client_id. */
  ORBITA_QUOTA_SESSIONS_PER_DAY: z.coerce.number().int().nonnegative().default(0),
  ORBITA_QUOTA_MESSAGES_PER_DAY: z.coerce.number().int().nonnegative().default(0),
  /** Hub tenant client_id; unset uses deprecated fallback (see resolveHubClientId). */
  ORBITA_HUB_CLIENT_ID: z.string().min(1).optional(),
  /** E-16 tickets lane: unset or not `1` keeps DDL, REST, and MCP ticket tools off. */
  ORBITA_TICKETS_ENABLED: z.enum(["0", "1"]).optional(),
  /** Comma-separated api_keys.id values allowed to ticket_approve / cancel proposed (default deny). */
  ORBITA_TICKETS_APPROVER_KEY_IDS: z.string().optional(),
});

export type PlatformEnv = z.infer<typeof PlatformEnvSchema>;

export function loadPlatformEnv(
  source: NodeJS.ProcessEnv = process.env,
): PlatformEnv {
  return PlatformEnvSchema.parse(source);
}
