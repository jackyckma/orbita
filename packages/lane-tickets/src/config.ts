import { z } from "zod";
import type { Logger } from "@orbita/platform";

export const TicketsEnvSchema = z.object({
  ORBITA_TICKETS_ENABLED: z.enum(["0", "1"]).optional(),
  ORBITA_TICKETS_APPROVER_KEY_IDS: z.string().optional(),
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
