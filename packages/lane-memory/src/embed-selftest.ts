import type { MemoryEnv } from "./config.js";
import { embedFailureReason, embedText } from "./embed.js";
import {
  embedFailureToLogReason,
  formatEmbedSelfTestReasonLabel,
} from "./embed-log.js";

export const EMBEDDING_SELFTEST_TEXT = "orbita-embed-selftest";
const SELFTEST_TIMEOUT_MS = 10_000;

const SELFTEST_TIMEOUT = Symbol("embedding-selftest-timeout");

export function isEmbeddingSelfTestEnabled(
  source: NodeJS.ProcessEnv = process.env,
): boolean {
  return source.ORBITA_EMBED_SELFTEST !== "0";
}

/**
 * Fire-and-forget embedding probe for deploy logs. Never throws; does not block boot.
 */
export type EmbeddingSelfTestLogger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
};

export function startEmbeddingSelfTest(
  env: MemoryEnv,
  logger: EmbeddingSelfTestLogger,
  options?: { enabled?: boolean; timeoutMs?: number },
): void {
  const enabled =
    options?.enabled ?? isEmbeddingSelfTestEnabled(process.env);
  if (!enabled) {
    return;
  }

  void runEmbeddingSelfTest(env, logger, options).catch(() => {
    // swallow — diagnostics only
  });
}

export async function runEmbeddingSelfTest(
  env: MemoryEnv,
  logger: EmbeddingSelfTestLogger,
  options?: { timeoutMs?: number },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? SELFTEST_TIMEOUT_MS;

  const raced = await Promise.race([
    embedText(env, EMBEDDING_SELFTEST_TEXT, { purpose: "db" }),
    new Promise<typeof SELFTEST_TIMEOUT>((resolve) => {
      setTimeout(() => resolve(SELFTEST_TIMEOUT), timeoutMs);
    }),
  ]);

  if (raced === SELFTEST_TIMEOUT) {
    logger.warn("embedding selftest failed reason=exception:Timeout");
    return;
  }

  if (raced) {
    logger.info(`embedding selftest ok dims=${raced.length}`);
    return;
  }

  const failure = embedFailureReason;
  const label = failure
    ? formatEmbedSelfTestReasonLabel(embedFailureToLogReason(failure))
    : "unknown";
  logger.warn(`embedding selftest failed reason=${label}`);
}
