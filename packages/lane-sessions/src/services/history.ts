import type { AgentProfileSnapshot } from "@orbita/profiles";
import type { ExecutionMeta, MessageInput, MessageOutput } from "@orbita/platform";
import type { MessageRow, SessionRow } from "../db/schema.js";

export type LlmChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** Byte-stable serialization for prompt cache continuity. */
export function serializeHistoryForLlm(
  profileSnapshot: AgentProfileSnapshot,
  rows: MessageRow[],
  memoryContext?: string,
): LlmChatMessage[] {
  const skillBlock = Object.entries(profileSnapshot.skill_contents)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, content]) => `## Skill: ${name}\n${content}`)
    .join("\n\n");

  const system = [
    profileSnapshot.system_prompt,
    memoryContext ? `## Long-term memory\n${memoryContext}` : null,
    skillBlock.length > 0 ? skillBlock : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const history: LlmChatMessage[] = [{ role: "system", content: system }];

  for (const row of rows) {
    if (row.role === "user" && row.input) {
      history.push({
        role: "user",
        content: stableStringify(row.input),
      });
    }
    if (row.role === "assistant" && row.output) {
      history.push({
        role: "assistant",
        content: stableStringify(row.output),
      });
    }
  }

  return history;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeys(obj[key]);
        return acc;
      }, {});
  }
  return value;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function sessionToJson(row: SessionRow) {
  return {
    id: row.id,
    client_id: row.clientId,
    agent_profile: row.agentProfileId,
    status: row.status,
    token_count_estimate: row.tokenCountEstimate,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    ended_at: row.endedAt?.toISOString() ?? null,
  };
}

export function messageToJson(row: MessageRow) {
  return {
    id: row.id,
    session_id: row.sessionId,
    sequence: row.sequence,
    role: row.role,
    input: row.input,
    output: row.output,
    execution_meta: row.executionMeta,
    created_at: row.createdAt.toISOString(),
  };
}

export function buildAssistantOutput(
  text: string,
  includeNaturalLanguage: boolean,
): MessageOutput {
  return {
    structured: { reply: text },
    ...(includeNaturalLanguage ? { natural_language: text } : {}),
  };
}

export type TurnResult = {
  output: MessageOutput;
  execution_meta: ExecutionMeta;
  assistantText: string;
};

export type AgentTurnRunner = (args: {
  session: SessionRow;
  history: MessageRow[];
  userInput: MessageInput;
  memoryContext?: string;
}) => Promise<TurnResult>;
