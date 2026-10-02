import type { MemoryEnv } from "./config.js";
import type { EmbedFailureReason } from "./embed.js";

/** Minimal sink reused by orbita-api pino logger and unit tests. */
export type EmbedLogger = {
  warn: (obj: Record<string, unknown>, msg?: string) => void;
};

export type EmbedLogReason =
  | { code: "no_api_key" }
  | { code: "empty_text" }
  | { code: "http_status"; status: number }
  | {
      code: "base_resp_error";
      status_code: number;
      status_msg?: string;
    }
  | { code: "no_vector" }
  | { code: "dimension_mismatch"; actual: number; expected: number }
  | { code: "exception"; error_class: string; message: string };

let embedLogger: EmbedLogger | null = null;

const silentLogger: EmbedLogger = {
  warn: () => {},
};

export function setEmbedLogger(logger: EmbedLogger): void {
  embedLogger = logger;
}

export function getEmbedLogger(): EmbedLogger {
  return embedLogger ?? silentLogger;
}

export function embeddingBaseUrlHost(env: MemoryEnv): string {
  try {
    return new URL(env.MINIMAX_BASE_URL).host;
  } catch {
    return "invalid-host";
  }
}

export function embedLogContext(env: MemoryEnv): {
  model: string;
  base_url_host: string;
  group_id_configured: boolean;
} {
  return {
    model: env.EMBEDDING_MODEL,
    base_url_host: embeddingBaseUrlHost(env),
    group_id_configured: Boolean(env.MINIMAX_GROUP_ID),
  };
}

export function embedFailureToLogReason(
  failure: EmbedFailureReason,
): EmbedLogReason {
  switch (failure.reason) {
    case "missing_key":
      return { code: "no_api_key" };
    case "empty_text":
      return { code: "empty_text" };
    case "http_error":
      return { code: "http_status", status: failure.httpStatus };
    case "minimax_status":
      return {
        code: "base_resp_error",
        status_code: failure.statusCode,
        status_msg: failure.statusMsg,
      };
    case "no_vector":
      return { code: "no_vector" };
    case "dimension_mismatch":
      return {
        code: "dimension_mismatch",
        actual: failure.actual,
        expected: failure.expected,
      };
    case "network_error":
      return {
        code: "exception",
        error_class: "Error",
        message: (failure.detail ?? "unknown").slice(0, 200),
      };
    default: {
      const _exhaustive: never = failure;
      return _exhaustive;
    }
  }
}

export function formatEmbedSelfTestReasonLabel(reason: EmbedLogReason): string {
  switch (reason.code) {
    case "no_api_key":
      return "no_api_key";
    case "empty_text":
      return "empty_text";
    case "http_status":
      return `http_status:${reason.status}`;
    case "base_resp_error":
      return `base_resp_error:${reason.status_code}`;
    case "no_vector":
      return "no_vector";
    case "dimension_mismatch":
      return `dimension_mismatch:${reason.actual},${reason.expected}`;
    case "exception":
      return `exception:${reason.error_class}`;
    default: {
      const _exhaustive: never = reason;
      return String(_exhaustive);
    }
  }
}

function logReasonFields(reason: EmbedLogReason): Record<string, unknown> {
  switch (reason.code) {
    case "http_status":
      return { http_status: reason.status };
    case "base_resp_error":
      return {
        status_code: reason.status_code,
        ...(reason.status_msg ? { status_msg: reason.status_msg } : {}),
      };
    case "dimension_mismatch":
      return { actual: reason.actual, expected: reason.expected };
    case "exception":
      return {
        error_class: reason.error_class,
        message: reason.message,
      };
    default:
      return {};
  }
}

/** One structured warn per failed embed attempt (no secrets, text, or GroupId). */
export function logEmbedAttemptFailure(
  env: MemoryEnv,
  failure: EmbedFailureReason,
): void {
  const logReason = embedFailureToLogReason(failure);
  const logger = getEmbedLogger();
  logger.warn(
    {
      event: "embedding_attempt_failed",
      reason: logReason.code,
      ...embedLogContext(env),
      ...logReasonFields(logReason),
    },
    "embedding attempt failed",
  );
}
