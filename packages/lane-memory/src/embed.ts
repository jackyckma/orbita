import OpenAI from "openai";
import type { MemoryEnv } from "./config.js";

export async function embedText(
  env: MemoryEnv,
  text: string,
): Promise<number[] | null> {
  if (!env.MINIMAX_API_KEY || !text.trim()) {
    return null;
  }
  const client = new OpenAI({
    apiKey: env.MINIMAX_API_KEY,
    baseURL: env.MINIMAX_BASE_URL,
  });
  try {
    const response = await client.embeddings.create({
      model: env.EMBEDDING_MODEL,
      input: text,
    });
    return response.data[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

export function formatVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
