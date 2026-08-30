import type { MemoryEnv } from "./config.js";

export type EmbedPurpose = "db" | "query";

export type EmbedTextOptions = {
  /** MiniMax: store with `db`, search with `query`. */
  purpose?: EmbedPurpose;
};

type MiniMaxEmbeddingResponse = {
  vectors?: number[][];
  base_resp?: { status_code?: number; status_msg?: string };
};

export type EmbedFailureReason =
  | { reason: "missing_key" }
  | { reason: "empty_text" }
  | { reason: "http_error"; httpStatus: number }
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
  | { reason: "network_error"; detail?: string };

export type EmbedResult =
  | { ok: true; vector: number[] }
  | { ok: false; failure: EmbedFailureReason };

/** Last failure from embedText; cleared on success. For diagnostics / follow-up tasks. */
export let embedFailureReason: EmbedFailureReason | null = null;

function embedFailure(failure: EmbedFailureReason): EmbedResult {
  return { ok: false, failure };
}

async function embedTextResult(
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
        model: env.EMBEDDING_MODEL,
        texts: [text],
        type: purpose,
      }),
    });

    if (!response.ok) {
      return embedFailure({
        reason: "http_error",
        httpStatus: response.status,
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
    if (vector.length !== env.EMBEDDING_DIMENSIONS) {
      // defer: refuse wrong-dim vectors rather than crash pgvector insert.
      // upgrade: migrate column + EMBEDDING_DIMENSIONS together if model dims change
      return embedFailure({
        reason: "dimension_mismatch",
        actual: vector.length,
        expected: env.EMBEDDING_DIMENSIONS,
      });
    }
    return { ok: true, vector };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : undefined;
    return embedFailure({ reason: "network_error", detail });
  }
}

/**
 * Embed text via MiniMax `/embeddings`.
 *
 * MiniMax is not OpenAI-compatible here: body uses `texts` + mandatory `type`
 * (`db` for indexed notes/memories, `query` for search), and the reply is
 * `{ vectors, base_resp }` — not OpenAI `data[].embedding`. The previous
 * OpenAI SDK path failed silently and left `notes.embedding` null, so
 * `note_search` returned empty while GET-by-id still worked.
 */
export async function embedText(
  env: MemoryEnv,
  text: string,
  options?: EmbedTextOptions,
): Promise<number[] | null> {
  const result = await embedTextResult(env, text, options);
  if (result.ok) {
    embedFailureReason = null;
    return result.vector;
  }
  embedFailureReason = result.failure;
  return null;
}

export function formatVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
