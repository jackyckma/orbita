import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { AgentProfileSnapshot } from "@orbita/profiles";
import type { ExecutionMeta } from "@orbita/platform";
import {
  buildAssistantOutput,
  serializeHistoryForLlm,
  type AgentTurnRunner,
  type LlmChatMessage,
} from "@orbita/sessions";
import type { AgentEnv } from "./config.js";

export type ProviderErrorKind =
  | "rate_limit_exceeded"
  | "quota_exhausted"
  | "provider_error";

export class ProviderCallError extends Error {
  constructor(
    public readonly provider: string,
    public readonly kind: ProviderErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ProviderCallError";
  }
}

function classifyError(provider: string, err: unknown): ProviderCallError {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (lower.includes("rate") && lower.includes("limit")) {
    return new ProviderCallError(provider, "rate_limit_exceeded", message);
  }
  if (lower.includes("quota") || lower.includes("insufficient")) {
    return new ProviderCallError(provider, "quota_exhausted", message);
  }
  return new ProviderCallError(provider, "provider_error", message);
}

async function callMinimax(
  env: AgentEnv,
  model: string,
  chatMessages: LlmChatMessage[],
): Promise<string> {
  if (!env.MINIMAX_API_KEY) {
    throw new ProviderCallError("minimax", "provider_error", "MINIMAX_API_KEY not set");
  }
  const client = new OpenAI({
    apiKey: env.MINIMAX_API_KEY,
    baseURL: env.MINIMAX_BASE_URL,
  });
  try {
    const response = await client.chat.completions.create({
      model,
      messages: chatMessages,
    });
    return stripThinkingContent(response.choices[0]?.message?.content ?? "");
  } catch (err) {
    throw classifyError("minimax", err);
  }
}

async function callAnthropic(
  env: AgentEnv,
  model: string,
  chatMessages: LlmChatMessage[],
): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new ProviderCallError("anthropic", "provider_error", "ANTHROPIC_API_KEY not set");
  }
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const system = chatMessages.find((m) => m.role === "system")?.content ?? "";
  const messages = chatMessages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system,
      messages,
    });
    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.type === "text" ? textBlock.text : "";
  } catch (err) {
    throw classifyError("anthropic", err);
  }
}

export function createAgentTurnRunner(env: AgentEnv): AgentTurnRunner {
  return async ({ session, history, memoryContext }) => {
    const profile = session.profileSnapshot;
    const chatMessages = serializeHistoryForLlm(profile, history, memoryContext);
    const includeNl = true;

    const primary = profile.model;
    const fallback = profile.fallback_model ?? {
      provider: "anthropic" as const,
      model: env.ANTHROPIC_MODEL,
    };

    let assistantText = "";
    let execution_meta: ExecutionMeta = {
      model_used: primary.model,
      provider: primary.provider,
      failover_occurred: false,
    };

    try {
      assistantText = await dispatch(env, primary.provider, primary.model, chatMessages);
    } catch (primaryErr) {
      if (!(primaryErr instanceof ProviderCallError)) {
        throw primaryErr;
      }
      assistantText = await dispatch(env, fallback.provider, fallback.model, chatMessages);
      execution_meta = {
        model_used: fallback.model,
        provider: fallback.provider,
        failover_occurred: true,
        primary_provider_error: primaryErr.kind,
      };
    }

    return {
      assistantText,
      output: buildAssistantOutput(assistantText, includeNl),
      execution_meta,
    };
  };
}

async function dispatch(
  env: AgentEnv,
  provider: AgentProfileSnapshot["model"]["provider"],
  model: string,
  chatMessages: LlmChatMessage[],
): Promise<string> {
  if (provider === "minimax") {
    return callMinimax(env, model, chatMessages);
  }
  if (provider === "anthropic") {
    return callAnthropic(env, model, chatMessages);
  }
  throw new ProviderCallError(provider, "provider_error", `Unsupported provider: ${provider}`);
}

function stripThinkingContent(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/redacted_thinking>\s*/gi, "")
    .replace(/[\s\S]*?<\/think>\s*/gi, "")
    .trim();
}

export function createCapabilitiesResponse() {
  return {
    intents: [
      {
        intent: "echo",
        params_schema: { type: "object", properties: { text: { type: "string" } } },
      },
    ],
    input_modes: ["structured", "text"],
    output_modes: ["structured", "natural_language"],
  };
}
