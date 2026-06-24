import { describe, expect, it } from "vitest";
import { parseAgentMessageTask } from "./agent-message.js";

describe("scheduled agent_message", () => {
  it("parses message text", () => {
    expect(parseAgentMessageTask({ type: "agent_message", message: "hello" })).toEqual({
      text: "hello",
    });
  });

  it("ignores other task types", () => {
    expect(parseAgentMessageTask({ type: "weekly_marketing_draft" })).toBeNull();
  });
});
