import { z } from "zod";

export const AgentPrincipalsEnvSchema = z.object({
  ORBITA_AGENT_PRINCIPALS_ENABLED: z.enum(["0", "1"]).optional(),
  ORBITA_AGENT_SCOPES_MODE: z.enum(["off", "shadow", "enforce"]).optional(),
});

export type AgentPrincipalsEnv = z.infer<typeof AgentPrincipalsEnvSchema>;

export function loadAgentPrincipalsEnv(
  source: NodeJS.ProcessEnv = process.env,
): AgentPrincipalsEnv {
  return AgentPrincipalsEnvSchema.parse(source);
}

export function agentPrincipalsFeatureEnabled(env: AgentPrincipalsEnv): boolean {
  return env.ORBITA_AGENT_PRINCIPALS_ENABLED === "1";
}
