import { z } from "zod";
import type { Logger } from "@orbita/platform";

const KeyMandatesJsonSchema = z.record(
  z.string(),
  z.array(z.string().uuid()),
);

export const TicketsEnvSchema = z.object({
  ORBITA_TICKETS_ENABLED: z.enum(["0", "1"]).optional(),
  /** Comma-separated api_keys.id values with founder role. */
  ORBITA_TICKETS_FOUNDER_KEY_IDS: z.string().optional(),
  /** Comma-separated api_keys.id values with integrator role. */
  ORBITA_TICKETS_INTEGRATOR_KEY_IDS: z.string().optional(),
  /** @deprecated Alias of ORBITA_TICKETS_FOUNDER_KEY_IDS when founder list is empty. */
  ORBITA_TICKETS_APPROVER_KEY_IDS: z.string().optional(),
  /** JSON map api_keys.id → mandate uuid[] for executor keys (validated when tickets flag is on). */
  ORBITA_TICKETS_KEY_MANDATES: z.string().optional(),
});

export type TicketsEnv = z.infer<typeof TicketsEnvSchema>;

export function loadTicketsEnv(
  source: NodeJS.ProcessEnv = process.env,
): TicketsEnv {
  return TicketsEnvSchema.parse(source);
}

export function ticketsFeatureEnabled(env: TicketsEnv): boolean {
  return env.ORBITA_TICKETS_ENABLED === "1";
}

export function parseKeyIdList(raw?: string): Set<string> {
  if (!raw?.trim()) {
    return new Set();
  }
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

/** @deprecated Use parseKeyIdList — founder key ids. */
export function parseApproverKeyIds(raw?: string): Set<string> {
  return parseKeyIdList(raw);
}

export function parseFounderKeyIds(env: TicketsEnv): Set<string> {
  const founder = parseKeyIdList(env.ORBITA_TICKETS_FOUNDER_KEY_IDS);
  if (founder.size > 0) {
    return founder;
  }
  return parseKeyIdList(env.ORBITA_TICKETS_APPROVER_KEY_IDS);
}

export function parseIntegratorKeyIds(env: TicketsEnv): Set<string> {
  return parseKeyIdList(env.ORBITA_TICKETS_INTEGRATOR_KEY_IDS);
}

export function warnIfOAuthInPrivilegedAllowlist(
  logger: Logger,
  founderKeyIds: ReadonlySet<string>,
  integratorKeyIds: ReadonlySet<string>,
): void {
  if (founderKeyIds.has("oauth")) {
    logger.warn(
      'ORBITA_TICKETS_FOUNDER_KEY_IDS (or deprecated APPROVER list) includes "oauth": every OAuth-connected MCP client gets founder role',
    );
  }
  if (integratorKeyIds.has("oauth")) {
    logger.warn(
      'ORBITA_TICKETS_INTEGRATOR_KEY_IDS includes "oauth": every OAuth-connected MCP client gets integrator role',
    );
  }
}

/** @deprecated Use warnIfOAuthInPrivilegedAllowlist */
export function warnIfOAuthInApproverAllowlist(
  logger: Logger,
  approverKeyIds: ReadonlySet<string>,
): void {
  warnIfOAuthInPrivilegedAllowlist(logger, approverKeyIds, new Set());
}

/** Parse ORBITA_TICKETS_KEY_MANDATES; throws when JSON is invalid or shape wrong. */
export function parseKeyMandates(raw: string | undefined): Map<string, string[]> {
  if (!raw?.trim()) {
    return new Map();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("ORBITA_TICKETS_KEY_MANDATES: invalid JSON");
  }
  const validated = KeyMandatesJsonSchema.parse(parsed);
  return new Map(Object.entries(validated));
}
