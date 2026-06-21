import type { AgentTurnRunner } from "@orbita/sessions";

/** Deterministic turn runner for Tier A E2E (no live LLM). */
export function createE2eMockTurnRunner(): AgentTurnRunner {
  return async ({ userInput }) => {
    const text =
      userInput.type === "text" ? userInput.text : JSON.stringify(userInput);
    const reply = `E2E_MOCK:${text}`;
    return {
      output: {
        structured: { reply },
        natural_language: reply,
      },
      execution_meta: {
        provider: "e2e_mock",
        model_used: "mock",
        tool_calls_made: 0,
        failover_occurred: false,
      },
      assistantText: reply,
    };
  };
}
