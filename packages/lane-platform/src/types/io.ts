import { z } from "zod";

export const StructuredInputSchema = z.object({
  type: z.literal("structured"),
  intent: z.string(),
  params: z.record(z.unknown()).default({}),
});

export const TextInputSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1),
});

export const MessageInputSchema = z.discriminatedUnion("type", [
  StructuredInputSchema,
  TextInputSchema,
]);

export type MessageInput = z.infer<typeof MessageInputSchema>;

export const ExecutionMetaSchema = z.object({
  model_used: z.string(),
  provider: z.string(),
  failover_occurred: z.boolean(),
  primary_provider_error: z.string().optional(),
  cache_break: z.boolean().optional(),
  token_count_estimate: z.number().int().nonnegative().optional(),
});

export type ExecutionMeta = z.infer<typeof ExecutionMetaSchema>;

export const MessageOutputSchema = z.object({
  structured: z.record(z.unknown()).optional(),
  natural_language: z.string().optional(),
});

export type MessageOutput = z.infer<typeof MessageOutputSchema>;

export function inputToPromptText(input: MessageInput): string {
  if (input.type === "text") {
    return input.text;
  }
  return JSON.stringify({ intent: input.intent, params: input.params });
}
