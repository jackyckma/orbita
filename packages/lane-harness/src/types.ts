import { z } from "zod";

export const agentTaskSchema = z.object({
  mode: z.enum(["message", "prompt_ref"]).default("message"),
  message: z.string().optional(),
  ref: z.string().optional(),
});

export const loopsSchema = z.object({
  agent: z.object({
    enabled: z.boolean().default(true),
    profile_id: z.string().min(1),
    task: agentTaskSchema,
  }),
  verify: z.object({ enabled: z.boolean().default(false) }).default({ enabled: false }),
  trigger: z
    .object({
      enabled: z.boolean().default(true),
      cron: z.string().min(1).optional(),
      timezone: z.string().default("UTC"),
    })
    .default({ enabled: true, timezone: "UTC" }),
  improve: z.object({ enabled: z.boolean().default(false) }).default({ enabled: false }),
});

export const memoryInjectSchema = z
  .object({
    memory_keys: z.array(z.string().min(1)).optional(),
    graph_from: z.string().uuid().optional(),
    depth: z.number().int().min(0).max(5).optional(),
    include_incoming: z.boolean().optional(),
    vector_query: z.string().optional(),
    top_k: z.number().int().min(1).max(32).optional(),
  })
  .optional();

export const harnessConfigSchema = z.object({
  session_policy: z.enum(["sticky", "per_run"]).default("sticky"),
  loops: loopsSchema,
  output: z
    .object({
      mode: z.enum(["poll", "webhook"]).default("poll"),
      webhook_url: z.string().url().optional(),
      emit_trajectory: z.boolean().default(true),
    })
    .default({ mode: "poll", emit_trajectory: true }),
  memory_inject: memoryInjectSchema,
  application: z.record(z.unknown()).optional(),
});

export type HarnessConfig = z.infer<typeof harnessConfigSchema>;

export const createHarnessBodySchema = z.object({
  template_id: z.string().min(1),
  name: z.string().min(1).max(120),
  overrides: z.record(z.unknown()).optional(),
});

export type HarnessTemplate = {
  id: string;
  version: number;
  extends?: string;
  description: string;
  defaults: Record<string, unknown>;
  application?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
};

export type HarnessCapabilities = {
  templates: string[];
  loops: {
    agent: boolean;
    trigger: boolean;
    verify: boolean;
    improve: boolean;
  };
};

export const HARNESS_CAPABILITIES: HarnessCapabilities = {
  templates: ["cron-agent", "editorial-supply@v1"],
  loops: {
    agent: true,
    trigger: true,
    verify: false,
    improve: false,
  },
};
