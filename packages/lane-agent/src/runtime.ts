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
import {
  executeToolCall,
  getAnthropicToolDefinitions,
  getToolDefinitions,
  listRegisteredTools,
  type ToolExecutionContext,
  type ToolTraceEvent,
} from "@orbita/tools";
import type { AgentEnv } from "./config.js";

const MAX_TOOL_ITERATIONS = 8;

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

export type CredentialResolver = (
  clientId: string,
  name: string,
) => Promise<string>;

export type ToolTraceCallback = (
  event: ToolTraceEvent & { sessionId: string; clientId: string },
) => void;

export type AgentTurnRunnerDeps = {
  resolveCredential?: CredentialResolver;
  onToolTrace?: ToolTraceCallback;
};

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

async function callAnthropicPlain(
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

async function callAnthropicWithTools(
  env: AgentEnv,
  model: string,
  chatMessages: LlmChatMessage[],
  allowedTools: string[],
  toolCtx: ToolExecutionContext,
): Promise<{ text: string; tool_calls_made: number }> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new ProviderCallError("anthropic", "provider_error", "ANTHROPIC_API_KEY not set");
  }
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const system = chatMessages.find((m) => m.role === "system")?.content ?? "";
  const tools = getAnthropicToolDefinitions(allowedTools);
  const messages: Anthropic.MessageParam[] = chatMessages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  let toolCallsMade = 0;

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system,
        messages,
        tools: tools.length > 0 ? (tools as Anthropic.Tool[]) : undefined,
      });

      const toolUses = response.content.filter((b) => b.type === "tool_use");
      if (toolUses.length === 0) {
        const text = response.content
          .filter((b) => b.type === "text")
          .map((b) => (b.type === "text" ? b.text : ""))
          .join("");
        return { text: stripThinkingContent(text), tool_calls_made: toolCallsMade };
      }

      messages.push({ role: "assistant", content: response.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        if (toolUse.type !== "tool_use") continue;
        const outcome = await executeToolCall(
          toolUse.name,
          JSON.stringify(toolUse.input),
          allowedTools,
          toolCtx,
        );
        toolCallsMade++;
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(outcome),
        });
      }
      messages.push({ role: "user", content: toolResults });
    }

    return { text: "", tool_calls_made: toolCallsMade };
  } catch (err) {
    throw classifyError("anthropic", err);
  }
}

async function callMinimaxWithTools(
  env: AgentEnv,
  model: string,
  chatMessages: LlmChatMessage[],
  allowedTools: string[],
  toolCtx: ToolExecutionContext,
): Promise<{ text: string; tool_calls_made: number }> {
  if (!env.MINIMAX_API_KEY) {
    throw new ProviderCallError("minimax", "provider_error", "MINIMAX_API_KEY not set");
  }
  const client = new OpenAI({
    apiKey: env.MINIMAX_API_KEY,
    baseURL: env.MINIMAX_BASE_URL,
  });
  const tools = getToolDefinitions(allowedTools);
  const messages: OpenAI.ChatCompletionMessageParam[] = chatMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let toolCallsMade = 0;

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await client.chat.completions.create({
        model,
        messages,
        ...(tools.length > 0 ? { tools } : {}),
      });
      const choice = response.choices[0]?.message;
      if (!choice) {
        return { text: "", tool_calls_made: toolCallsMade };
      }

      const toolCalls = choice.tool_calls ?? [];
      if (toolCalls.length === 0) {
        return {
          text: stripThinkingContent(choice.content ?? ""),
          tool_calls_made: toolCallsMade,
        };
      }

      messages.push(choice);
      for (const toolCall of toolCalls) {
        if (toolCall.type !== "function") continue;
        const outcome = await executeToolCall(
          toolCall.function.name,
          toolCall.function.arguments,
          allowedTools,
          toolCtx,
        );
        toolCallsMade++;
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(outcome),
        });
      }
    }

    return { text: "", tool_calls_made: toolCallsMade };
  } catch (err) {
    throw classifyError("minimax", err);
  }
}

async function callMinimaxPlain(
  env: AgentEnv,
  model: string,
  chatMessages: LlmChatMessage[],
): Promise<string> {
  const { text } = await callMinimaxWithTools(env, model, chatMessages, [], {
    clientId: "",
    resolveCredential: async () => {
      throw new Error("credentials unavailable");
    },
  });
  return text;
}

async function dispatchWithTools(
  env: AgentEnv,
  provider: AgentProfileSnapshot["model"]["provider"],
  model: string,
  chatMessages: LlmChatMessage[],
  allowedTools: string[],
  toolCtx: ToolExecutionContext,
): Promise<{ text: string; tool_calls_made: number }> {
  if (provider === "minimax") {
    if (allowedTools.length > 0) {
      return callMinimaxWithTools(env, model, chatMessages, allowedTools, toolCtx);
    }
    return { text: await callMinimaxPlain(env, model, chatMessages), tool_calls_made: 0 };
  }
  if (provider === "anthropic") {
    if (allowedTools.length > 0) {
      return callAnthropicWithTools(env, model, chatMessages, allowedTools, toolCtx);
    }
    return { text: await callAnthropicPlain(env, model, chatMessages), tool_calls_made: 0 };
  }
  throw new ProviderCallError(provider, "provider_error", `Unsupported provider: ${provider}`);
}

export function createAgentTurnRunner(
  env: AgentEnv,
  deps: AgentTurnRunnerDeps = {},
): AgentTurnRunner {
  return async ({ session, history, memoryContext }) => {
    const profile = session.profileSnapshot;
    const chatMessages = serializeHistoryForLlm(
      profile,
      history,
      memoryContext,
      session.contextSummary,
    );
    const includeNl = true;
    const allowedTools = profile.allowed_tools ?? [];

    const primary = profile.model;
    const fallback = profile.fallback_model ?? {
      provider: "anthropic" as const,
      model: env.ANTHROPIC_MODEL,
    };

    const toolCtx: ToolExecutionContext = {
      clientId: session.clientId,
      resolveCredential: async (name) => {
        if (!deps.resolveCredential) {
          throw new Error("Credential resolver not configured");
        }
        return deps.resolveCredential(session.clientId, name);
      },
      onToolTrace: deps.onToolTrace
        ? (event) =>
            deps.onToolTrace!({
              ...event,
              sessionId: session.id,
              clientId: session.clientId,
            })
        : undefined,
    };

    let assistantText = "";
    let toolCallsMade = 0;
    let execution_meta: ExecutionMeta = {
      model_used: primary.model,
      provider: primary.provider,
      failover_occurred: false,
    };

    try {
      const result = await dispatchWithTools(
        env,
        primary.provider,
        primary.model,
        chatMessages,
        allowedTools,
        toolCtx,
      );
      assistantText = result.text;
      toolCallsMade = result.tool_calls_made;
    } catch (primaryErr) {
      if (!(primaryErr instanceof ProviderCallError)) {
        throw primaryErr;
      }
      const result = await dispatchWithTools(
        env,
        fallback.provider,
        fallback.model,
        chatMessages,
        allowedTools,
        toolCtx,
      );
      assistantText = result.text;
      toolCallsMade = result.tool_calls_made;
      execution_meta = {
        model_used: fallback.model,
        provider: fallback.provider,
        failover_occurred: true,
        primary_provider_error: primaryErr.kind,
      };
    }

    if (toolCallsMade > 0) {
      execution_meta = { ...execution_meta, tool_calls_made: toolCallsMade };
    }

    return {
      assistantText,
      output: buildAssistantOutput(assistantText, includeNl),
      execution_meta,
    };
  };
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
    tools: listRegisteredTools(),
  };
}
