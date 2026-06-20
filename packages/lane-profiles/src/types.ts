import { z } from "zod";

export const ModelRefSchema = z.object({
  provider: z.enum(["minimax", "anthropic", "openai", "openrouter"]),
  model: z.string(),
});

export const AgentProfileSchema = z.object({
  id: z.string(),
  description: z.string(),
  model: ModelRefSchema,
  fallback_model: ModelRefSchema.optional(),
  system_prompt: z.string(),
  skills: z.array(z.string()),
  allowed_tools: z.array(z.string()),
});

export type AgentProfile = z.infer<typeof AgentProfileSchema>;

export type AgentProfileSnapshot = AgentProfile & {
  skill_contents: Record<string, string>;
  bound_at: string;
};
