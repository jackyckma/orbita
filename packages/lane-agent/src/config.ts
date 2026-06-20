import { z } from "zod";

export const AgentEnvSchema = z.object({
  MINIMAX_API_KEY: z.string().optional(),
  MINIMAX_MODEL: z.string().default("MiniMax-M3"),
  MINIMAX_BASE_URL: z.string().url().default("https://api.minimax.io/v1"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),
});

export type AgentEnv = z.infer<typeof AgentEnvSchema>;

export function loadAgentEnv(
  source: NodeJS.ProcessEnv = process.env,
): AgentEnv {
  return AgentEnvSchema.parse(source);
}
