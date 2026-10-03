import {
  EMBEDDING_PROVIDER_OPENAI_COMPATIBLE,
  type MemoryEnv,
  embeddingModelForProvider,
  effectiveEmbeddingModel,
} from "./config.js";
import {
  gateEmbedRateLimitBreaker,
  recordEmbedRateLimitFailure,
} from "./embed-breaker.js";
import { logEmbedAttemptFailure } from "./embed-log.js";

export type EmbedPurpose = "db" | "query";

export type EmbedTextOptions = {
  /** MiniMax: store with `db`, search with `query`. Ignored for openai_compatible. */
  purpose?: EmbedPurpose;
};

type MiniMaxEmbeddingResponse = {
  vectors?: number[][];
  base_resp?: { status_code?: number; status_msg?: string };
};

type OpenAiCompatibleEmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
  error?: { message?: string };
  message?: string;
};

export type EmbedFailureReason =
  | { reason: "missing_key" }
  | { reason: "empty_text" }
  | { reason: "http_error"; httpStatus: number; message?: string }
  | {
      reason: "minimax_status";
      statusCode: number;
      statusMsg?: string;
    }
  | { reason: "no_vector" }
  | {
      reason: "dimension_mismatch";
      actual: number;
      expected: number;
    }
  | { reason: "network_error"; detail?: string }
  | { reason: "rate_limited_breaker" };

export type EmbedResult =
  | { ok: true; vector: number[] }
  | { ok: false; failure: EmbedFailureReason };

/** Last failure from embedText; cleared on success. For diagnostics / follow-up tasks. */
export let embedFailureReason: EmbedFailureReason | null = null;

function embedFailure(failure: EmbedFailureReason): EmbedResult {
  return { ok: false, failure };
}

function checkVectorDimensions(
  env: MemoryEnv,
  vector: number[],
): EmbedResult | { ok: true; vector: number[] } {
  if (vector.length !== env.EMBEDDING_DIMENSIONS) {
    return embedFailure({
      reason: "dimension_mismatch",
      actual: vector.length,
      expected: env.EMBEDDING_DIMENSIONS,
    });
  }
  return { ok: true, vector };
}

async function readHttpErrorMessage(
  response: Response,
): Promise<string | undefined> {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
      message?: string;
    };
    const raw = payload.error?.message ?? payload.message;
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim().slice(0, 200);
    }
  } catch {
    // ignore non-JSON bodies
  }
  return undefined;
}

async function embedMiniMaxResult(
  env: MemoryEnv,
  text: string,
  options?: EmbedTextOptions,
): Promise<EmbedResult> {
  if (!env.MINIMAX_API_KEY) {
    return embedFailure({ reason: "missing_key" });
  }
  if (!text.trim()) {
    return embedFailure({ reason: "empty_text" });
  }

  const purpose: EmbedPurpose = options?.purpose ?? "db";
  const base = env.MINIMAX_BASE_URL.replace(/\/$/, "");
  const url = new URL(`${base}/embeddings`);
  if (env.MINIMAX_GROUP_ID) {
    url.searchParams.set("GroupId", env.MINIMAX_GROUP_ID);
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MINIMAX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: effectiveEmbeddingModel(env),
        texts: [text],
        type: purpose,
      }),
    });

    if (!response.ok) {
      const message = await readHttpErrorMessage(response);
      return embedFailure({
        reason: "http_error",
        httpStatus: response.status,
        message,
      });
    }

    const payload = (await response.json()) as MiniMaxEmbeddingResponse;
    const status = payload.base_resp?.status_code;
    if (status !== undefined && status !== 0) {
      return embedFailure({
        reason: "minimax_status",
        statusCode: status,
        statusMsg: payload.base_resp?.status_msg,
      });
    }

    const vector = payload.vectors?.[0];
    if (!vector?.length) {
      return embedFailure({ reason: "no_vector" });
    }
    return checkVectorDimensions(env, vector);
  } catch (error) {
    const detail = error instanceof Error ? error.message : undefined;
    return embedFailure({ reason: "network_error", detail });
  }
}

async function embedOpenAiCompatibleResult(
  env: MemoryEnv,
  text: string,
): Promise<EmbedResult> {
  if (!env.EMBEDDING_API_KEY?.trim()) {
    return embedFailure({ reason: "missing_key" });
  }
  const model = embeddingModelForProvider(env);
  if (!model) {
    return embedFailure({ reason: "missing_key" });
  }
  if (!text.trim()) {
    return embedFailure({ reason: "empty_text" });
  }

  const base = env.EMBEDDING_BASE_URL.replace(/\/$/, "");
  const url = `${base}/embeddings`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.EMBEDDING_API_KEY}`,
    "Content-Type": "application/json",
  };
  if (env.EMBEDDING_HTTP_REFERER) {
    headers["HTTP-Referer"] = env.EMBEDDING_HTTP_REFERER;
  }
  if (env.EMBEDDING_APP_TITLE) {
    headers["X-Title"] = env.EMBEDDING_APP_TITLE;
  }

  const body: Record<string, unknown> = { model, input: text };
  if (env.EMBEDDING_SEND_DIMENSIONS) {
    body.dimensions = env.EMBEDDING_DIMENSIONS;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const message = await readHttpErrorMessage(response);
      return embedFailure({
        reason: "http_error",
        httpStatus: response.status,
        message,
      });
    }

    const payload = (await response.json()) as OpenAiCompatibleEmbeddingResponse;
    const vector = payload.data?.[0]?.embedding;
    if (!vector?.length) {
      return embedFailure({ reason: "no_vector" });
    }
    return checkVectorDimensions(env, vector);
  } catch (error) {
    const detail = error instanceof Error ? error.message : undefined;
    return embedFailure({ reason: "network_error", detail });
  }
}

async function embedTextResult(
  env: MemoryEnv,
  text: string,
  options?: EmbedTextOptions,
): Promise<EmbedResult> {
  if (env.EMBEDDING_PROVIDER === EMBEDDING_PROVIDER_OPENAI_COMPATIBLE) {
    return embedOpenAiCompatibleResult(env, text);
  }
  return embedMiniMaxResult(env, text, options);
}

/**
 * Embed text via the configured provider (`EMBEDDING_PROVIDER`).
 *
 * MiniMax is not OpenAI-compatible: body uses `texts` + mandatory `type`
 * (`db` for indexed notes/memories, `query` for search), and the reply is
 * `{ vectors, base_resp }` — not OpenAI `data[].embedding`.
 *
 * `openai_compatible` uses POST `{base}/embeddings` with `{ model, input }`
 * (optional `dimensions`) and reads `data[0].embedding`; `purpose` is ignored.
 */
export async function embedText(
  env: MemoryEnv,
  text: string,
  options?: EmbedTextOptions,
): Promise<number[] | null> {
  const gate = gateEmbedRateLimitBreaker();
  if (gate.blocked) {
    embedFailureReason = gate.failure;
    logEmbedAttemptFailure(env, gate.failure);
    return null;
  }

  const result = await embedTextResult(env, text, options);
  if (result.ok) {
    embedFailureReason = null;
    return result.vector;
  }
  embedFailureReason = result.failure;
  recordEmbedRateLimitFailure(env, result.failure);
  logEmbedAttemptFailure(env, result.failure);
  return null;
}

export function formatVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
