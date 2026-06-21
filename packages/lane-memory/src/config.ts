import { z } from "zod";

export const MemoryEnvSchema = z.object({
  MINIMAX_API_KEY: z.string().optional(),
  MINIMAX_BASE_URL: z.string().url().default("https://api.minimax.io/v1"),
  EMBEDDING_MODEL: z.string().default("embo-01"),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1024),
  MEMORY_TOP_K: z.coerce.number().int().positive().default(8),
});

export type MemoryEnv = z.infer<typeof MemoryEnvSchema>;

export function loadMemoryEnv(
  source: NodeJS.ProcessEnv = process.env,
): MemoryEnv {
  return MemoryEnvSchema.parse(source);
}
