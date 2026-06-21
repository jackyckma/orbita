import { describe, expect, it } from "vitest";
import {
  computeSessionTokenEstimate,
  estimateTokens,
  serializeHistoryForLlm,
} from "./services/history.js";
import type { MessageRow } from "./db/schema.js";
import type { AgentProfileSnapshot } from "@orbita/profiles";

const profile: AgentProfileSnapshot = {
  id: "default",
  description: "test",
  model: { provider: "minimax", model: "MiniMax-M3" },
  system_prompt: "You are a test agent.",
  skills: [],
  allowed_tools: [],
  skill_contents: {},
  bound_at: new Date().toISOString(),
};

describe("history", () => {
  it("estimates tokens", () => {
    expect(estimateTokens("hello world")).toBeGreaterThan(0);
  });
});

describe("serializeHistoryForLlm", () => {
  it("includes compressed conversation history in system prompt", () => {
    const messages: MessageRow[] = [
      {
        id: "1",
        sessionId: "s1",
        sequence: 1,
        role: "user",
        input: { type: "text", text: "hello" },
        output: null,
        executionMeta: null,
        createdAt: new Date(),
      },
    ];
    const chat = serializeHistoryForLlm(
      profile,
      messages,
      "- [note] remembered",
      "Earlier we discussed deployment.",
    );
    expect(chat[0]?.content).toContain("## Compressed conversation history");
    expect(chat[0]?.content).toContain("Earlier we discussed deployment.");
    expect(chat[0]?.content).toContain("## Long-term memory");
  });
});

describe("computeSessionTokenEstimate", () => {
  it("counts summary and messages", () => {
    const messages: MessageRow[] = [
      {
        id: "1",
        sessionId: "s1",
        sequence: 1,
        role: "user",
        input: { type: "text", text: "abcd" },
        output: null,
        executionMeta: null,
        createdAt: new Date(),
      },
    ];
    const withSummary = computeSessionTokenEstimate(profile, "summary text", messages);
    const withoutSummary = computeSessionTokenEstimate(profile, null, messages);
    expect(withSummary).toBeGreaterThan(withoutSummary);
  });
});
