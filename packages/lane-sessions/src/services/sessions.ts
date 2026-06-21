import { and, asc, eq, gt, inArray } from "drizzle-orm";
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
  computeSessionTokenEstimate,
  estimateTokens,
  messageToJson,
  sessionToJson,
  type AgentTurnRunner,
  type SessionSummarizer,
} from "./history.js";

const TOKEN_CEILING = 120_000;
const RECENT_MESSAGES_TO_KEEP = 8;

export type CompressResult = {
  compressed: boolean;
  token_count_estimate: number;
  cache_break: boolean;
  message?: string;
};

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
  summarizer?: SessionSummarizer,
): Promise<CompressResult> {
  const row = await getSessionForClient(db, sessionId, clientId);
  if (row.status !== "active") {
    throw conflict("Session is not active");
  }

  const allMessages = await listMessages(db, sessionId);
  if (allMessages.length <= RECENT_MESSAGES_TO_KEEP) {
    return {
      compressed: false,
      token_count_estimate: row.tokenCountEstimate,
      cache_break: false,
      message: "Not enough messages to compress yet",
    };
  }

  if (!summarizer) {
    return {
      compressed: false,
      token_count_estimate: row.tokenCountEstimate,
      cache_break: false,
      message: "Summarizer not configured",
    };
  }

  const keepFromSequence =
    allMessages[allMessages.length - RECENT_MESSAGES_TO_KEEP]!.sequence;
  const toCompress = allMessages.filter((m) => m.sequence < keepFromSequence);
  const kept = allMessages.filter((m) => m.sequence >= keepFromSequence);

  const summary = await summarizer({
    existingSummary: row.contextSummary,
    messages: toCompress,
    profileSnapshot: row.profileSnapshot,
  });

  const idsToDelete = toCompress.map((m) => m.id);
  if (idsToDelete.length > 0) {
    await db.db.delete(messages).where(inArray(messages.id, idsToDelete));
  }

  const tokenCount = computeSessionTokenEstimate(
    row.profileSnapshot,
    summary,
    kept,
  );

  await db.db
    .update(sessions)
    .set({
      contextSummary: summary,
      tokenCountEstimate: tokenCount,
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, sessionId));

  return {
    compressed: true,
    token_count_estimate: tokenCount,
    cache_break: true,
    message: `Compressed ${toCompress.length} messages; kept ${kept.length} recent messages`,
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
  summarizer?: SessionSummarizer,
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
  let newTokenCount = session.tokenCountEstimate + tokenDelta;
  let cacheBreak = false;

  if (newTokenCount >= TOKEN_CEILING) {
    const compression = await compressSession(db, sessionId, clientId, summarizer);
    if (compression.compressed) {
      cacheBreak = true;
      newTokenCount = compression.token_count_estimate;
    } else {
      await db.db
        .update(sessions)
        .set({ tokenCountEstimate: newTokenCount, updatedAt: new Date() })
        .where(eq(sessions.id, sessionId));
    }
  } else {
    await db.db
      .update(sessions)
      .set({ tokenCountEstimate: newTokenCount, updatedAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }

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
