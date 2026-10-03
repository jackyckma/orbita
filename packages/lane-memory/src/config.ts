import { z } from "zod";

export const EMBEDDING_PROVIDER_MINIMAX = "minimax";
export const EMBEDDING_PROVIDER_OPENAI_COMPATIBLE = "openai_compatible";

const EmbeddingProviderSchema = z.enum([
  EMBEDDING_PROVIDER_MINIMAX,
  EMBEDDING_PROVIDER_OPENAI_COMPATIBLE,
]);

function parseTruthyEnv(value: unknown): boolean {
  return value === "1" || value === "true" || value === true;
}

export const MemoryEnvSchema = z.object({
  MINIMAX_API_KEY: z.string().optional(),
  MINIMAX_BASE_URL: z.string().url().default("https://api.minimax.io/v1"),
  /** Optional; some MiniMax regions require `?GroupId=` on `/embeddings`. */
  MINIMAX_GROUP_ID: z.string().optional(),
  EMBEDDING_PROVIDER: EmbeddingProviderSchema.default(EMBEDDING_PROVIDER_MINIMAX),
  /** OpenAI-compatible embeddings (e.g. OpenRouter); not used when provider is minimax. */
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_BASE_URL: z
    .string()
    .url()
    .default("https://openrouter.ai/api/v1"),
  /** Required for openai_compatible; defaults to embo-01 for minimax. */
  EMBEDDING_MODEL: z.string().optional(),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1024),
  EMBEDDING_SEND_DIMENSIONS: z
    .preprocess((v) => parseTruthyEnv(v), z.boolean())
    .default(false),
  EMBEDDING_HTTP_REFERER: z.string().optional(),
  EMBEDDING_APP_TITLE: z.string().optional(),
  MEMORY_TOP_K: z.coerce.number().int().positive().default(8),
});

export type MemoryEnv = z.infer<typeof MemoryEnvSchema>;

export function loadMemoryEnv(
  source: NodeJS.ProcessEnv = process.env,
): MemoryEnv {
  return MemoryEnvSchema.parse(source);
}

/** MiniMax default model when EMBEDDING_MODEL is unset. */
export function effectiveEmbeddingModel(env: MemoryEnv): string {
  return env.EMBEDDING_MODEL?.trim() || "embo-01";
}

/** Model id sent to the active provider; undefined → missing_key for openai_compatible. */
export function embeddingModelForProvider(env: MemoryEnv): string | undefined {
  if (env.EMBEDDING_PROVIDER === EMBEDDING_PROVIDER_OPENAI_COMPATIBLE) {
    const model = env.EMBEDDING_MODEL?.trim();
    return model || undefined;
  }
  return effectiveEmbeddingModel(env);
}
