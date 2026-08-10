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
  if (!env.MINIMAX_API_KEY || !text.trim()) {
    return null;
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
      return null;
    }

    const payload = (await response.json()) as MiniMaxEmbeddingResponse;
    const status = payload.base_resp?.status_code;
    if (status !== undefined && status !== 0) {
      return null;
    }

    const vector = payload.vectors?.[0];
    if (!vector?.length) {
      return null;
    }
    if (vector.length !== env.EMBEDDING_DIMENSIONS) {
      // defer: refuse wrong-dim vectors rather than crash pgvector insert.
      // upgrade: migrate column + EMBEDDING_DIMENSIONS together if model dims change
      return null;
    }
    return vector;
  } catch {
    return null;
  }
}

export function formatVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
