import { and, asc, eq, gt } from "drizzle-orm";
import { bindProfileSnapshot } from "@orbita/profiles";
import {
  badRequest,
  conflict,
  notFound,
  type MessageInput,
} from "@orbita/platform";
import type { SessionsDb } from "../db/client.js";
import { messages, sessions, type SessionRow } from "../db/schema.js";
import {
  buildAssistantOutput,
  estimateTokens,
  messageToJson,
  sessionToJson,
  type AgentTurnRunner,
} from "./history.js";

const TOKEN_CEILING = 120_000;

export async function createSession(
  db: SessionsDb,
  clientId: string,
  agentProfileId: string,
) {
  const profileSnapshot = bindProfileSnapshot(agentProfileId);
  const [row] = await db.db
    .insert(sessions)
    .values({
      clientId,
      agentProfileId,
      profileSnapshot,
      tokenCountEstimate: estimateTokens(profileSnapshot.system_prompt),
    })
    .returning();
  if (!row) throw new Error("Failed to create session");
  return row;
}

export async function getSessionForClient(
  db: SessionsDb,
  sessionId: string,
  clientId: string,
): Promise<SessionRow> {
  const [row] = await db.db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.clientId, clientId)))
    .limit(1);
  if (!row) throw notFound("Session not found");
  return row;
}

export async function listMessages(
  db: SessionsDb,
  sessionId: string,
  sinceSequence?: number,
) {
  const conditions = [eq(messages.sessionId, sessionId)];
  if (sinceSequence !== undefined) {
    conditions.push(gt(messages.sequence, sinceSequence));
  }
  return db.db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(asc(messages.sequence));
}

export async function deleteSession(
  db: SessionsDb,
  sessionId: string,
  clientId: string,
) {
  const row = await getSessionForClient(db, sessionId, clientId);
  if (row.status === "ended") {
    throw conflict("Session already ended");
  }
  const [updated] = await db.db
    .update(sessions)
    .set({ status: "ended", endedAt: new Date(), updatedAt: new Date() })
    .where(eq(sessions.id, sessionId))
    .returning();
  return updated!;
}

export async function compressSession(
  db: SessionsDb,
  sessionId: string,
  clientId: string,
) {
  const row = await getSessionForClient(db, sessionId, clientId);
  if (row.status !== "active") {
    throw conflict("Session is not active");
  }
  // v1: record intent only; full summarization comes later
  return {
    compressed: false,
    token_count_estimate: row.tokenCountEstimate,
    cache_break: false,
    message: "Compression recorded; no-op in W1 (summarization deferred)",
  };
}

async function nextSequence(db: SessionsDb, sessionId: string): Promise<number> {
  const rows = await db.db
    .select({ sequence: messages.sequence })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.sequence));
  const last = rows.at(-1)?.sequence ?? 0;
  return last + 1;
}

export async function postMessage(
  db: SessionsDb,
  sessionId: string,
  clientId: string,
  input: MessageInput,
  includeNaturalLanguage: boolean,
  runTurn?: AgentTurnRunner,
) {
  const session = await getSessionForClient(db, sessionId, clientId);
  if (session.status !== "active") {
    throw conflict("Session is not active");
  }

  const userSequence = await nextSequence(db, sessionId);
  const [userMessage] = await db.db
    .insert(messages)
    .values({
      sessionId,
      sequence: userSequence,
      role: "user",
      input,
    })
    .returning();
  if (!userMessage) throw new Error("Failed to store user message");

  let turnResult = runTurn
    ? await runTurn({
        session,
        history: await listMessages(db, sessionId),
        userInput: input,
        memoryContext: undefined,
      })
    : null;

  if (!turnResult) {
    const placeholder = "Agent runtime not configured";
    turnResult = {
      assistantText: placeholder,
      output: buildAssistantOutput(placeholder, includeNaturalLanguage),
      execution_meta: {
        model_used: "none",
        provider: "none",
        failover_occurred: false,
      },
    };
  }

  const assistantSequence = userSequence + 1;
  const [assistantMessage] = await db.db
    .insert(messages)
    .values({
      sessionId,
      sequence: assistantSequence,
      role: "assistant",
      output: turnResult.output,
      executionMeta: turnResult.execution_meta,
    })
    .returning();

  const tokenDelta =
    estimateTokens(JSON.stringify(input)) +
    estimateTokens(turnResult.assistantText);
  const newTokenCount = session.tokenCountEstimate + tokenDelta;
  let cacheBreak = false;

  if (newTokenCount >= TOKEN_CEILING) {
    await compressSession(db, sessionId, clientId);
    cacheBreak = true;
  }

  await db.db
    .update(sessions)
    .set({ tokenCountEstimate: newTokenCount, updatedAt: new Date() })
    .where(eq(sessions.id, sessionId));

  return {
    user_message: messageToJson(userMessage),
    assistant_message: messageToJson(assistantMessage!),
    output: turnResult.output,
    execution_meta: {
      ...turnResult.execution_meta,
      ...(cacheBreak ? { cache_break: true } : {}),
      token_count_estimate: newTokenCount,
    },
  };
}

export { messageToJson, sessionToJson };
