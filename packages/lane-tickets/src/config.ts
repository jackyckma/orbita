import { z } from "zod";
import type { Logger } from "@orbita/platform";

const KeyMandatesJsonSchema = z.record(
  z.string(),
  z.array(z.string().uuid()),
);

export const TicketsEnvSchema = z.object({
  ORBITA_TICKETS_ENABLED: z.enum(["0", "1"]).optional(),
  /** Comma-separated api_keys.id values that act as human-capable ticket actors (and approver gates). */
  ORBITA_TICKETS_APPROVER_KEY_IDS: z.string().optional(),
  /** JSON map api_keys.id → mandate uuid[] for agent keys (validated when tickets flag is on). */
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

export function parseApproverKeyIds(raw?: string): Set<string> {
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

export function warnIfOAuthInApproverAllowlist(
  logger: Logger,
  approverKeyIds: ReadonlySet<string>,
): void {
  if (approverKeyIds.has("oauth")) {
    logger.warn(
      'ORBITA_TICKETS_APPROVER_KEY_IDS includes "oauth": every OAuth-connected MCP client can approve tickets',
    );
  }
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
