import type { MessageInput } from "@orbita/platform";
import type { AgentTurnRunner, SessionSummarizer } from "@orbita/sessions";
import type { SessionsDb } from "@orbita/sessions";
import { postMessage } from "@orbita/sessions";

export type ScheduledAgentMessageTask = {
  type: "agent_message";
  message?: string;
  text?: string;
};

export function parseAgentMessageTask(
  task: Record<string, unknown>,
): { text: string } | null {
  if (task.type !== "agent_message") return null;
  const text = String(task.message ?? task.text ?? "").trim();
  if (!text) return null;
  return { text };
}

export async function runScheduledAgentMessage(
  sessionsDb: SessionsDb,
  sessionId: string,
  clientId: string,
  task: Record<string, unknown>,
  runTurn: AgentTurnRunner,
  summarizer?: SessionSummarizer,
): Promise<{ ran: boolean; error?: string }> {
  const parsed = parseAgentMessageTask(task);
  if (!parsed) return { ran: false };

  const input: MessageInput = { type: "text", text: parsed.text };
  try {
    await postMessage(
      sessionsDb,
      sessionId,
      clientId,
      input,
      true,
      runTurn,
      summarizer,
    );
    return { ran: true };
  } catch (err) {
    return {
      ran: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
