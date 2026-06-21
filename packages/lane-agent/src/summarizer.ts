import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { AgentProfileSnapshot } from "@orbita/profiles";
import type { MessageRow, SessionSummarizer } from "@orbita/sessions";
import type { AgentEnv } from "./config.js";
import { ProviderCallError } from "./runtime.js";

function messageToTranscriptLine(row: MessageRow): string {
  if (row.role === "user" && row.input) {
    return `User: ${JSON.stringify(row.input)}`;
  }
  if (row.role === "assistant" && row.output) {
    const text =
      row.output.natural_language ??
      JSON.stringify(row.output.structured ?? row.output);
    return `Assistant: ${text}`;
  }
  return "";
}

async function summarizeWithProvider(
  env: AgentEnv,
  provider: AgentProfileSnapshot["model"]["provider"],
  model: string,
  prompt: string,
): Promise<string> {
  if (provider === "minimax") {
    if (!env.MINIMAX_API_KEY) {
      throw new ProviderCallError("minimax", "provider_error", "MINIMAX_API_KEY not set");
    }
    const client = new OpenAI({
      apiKey: env.MINIMAX_API_KEY,
      baseURL: env.MINIMAX_BASE_URL,
    });
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
    });
    return response.choices[0]?.message?.content?.trim() ?? "";
  }

  if (provider === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) {
      throw new ProviderCallError("anthropic", "provider_error", "ANTHROPIC_API_KEY not set");
    }
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.type === "text" ? textBlock.text.trim() : "";
  }

  throw new ProviderCallError(provider, "provider_error", `Unsupported provider: ${provider}`);
}

export function createSessionSummarizer(env: AgentEnv): SessionSummarizer {
  return async ({ existingSummary, messages, profileSnapshot }) => {
    const transcript = messages.map(messageToTranscriptLine).filter(Boolean).join("\n");
    const prompt = [
      "Summarize the following conversation history for future context.",
      "Preserve key facts, decisions, open questions, and entity names.",
      "Write a concise bullet list. Do not include preamble.",
      existingSummary
        ? `\nExisting summary to merge and update:\n${existingSummary}\n`
        : "",
      `\nNew messages to incorporate:\n${transcript}`,
    ].join("\n");

    const primary = profileSnapshot.model;
    const fallback = profileSnapshot.fallback_model ?? {
      provider: "anthropic" as const,
      model: env.ANTHROPIC_MODEL,
    };

    try {
      return await summarizeWithProvider(env, primary.provider, primary.model, prompt);
    } catch (primaryErr) {
      if (!(primaryErr instanceof ProviderCallError)) {
        throw primaryErr;
      }
      return summarizeWithProvider(
        env,
        fallback.provider,
        fallback.model,
        prompt,
      );
    }
  };
}
