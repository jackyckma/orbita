import { and, eq } from "drizzle-orm";
import { computeNextCronRun, isJobDue, runScheduledAgentMessage } from "@orbita/scheduler";
import type { AgentTurnRunner, SessionSummarizer, SessionsDb } from "@orbita/sessions";
import type { HarnessDb } from "./db/client.js";
import { harnessRuns, harnesses } from "./db/schema.js";
import { resolveAgentMessage } from "./templates.js";
import type { HarnessConfig } from "./types.js";

function cronFingerprint(cron: string, dueAt: Date): string {
  return `${cron}:${dueAt.toISOString().slice(0, 16)}`;
}

export async function executeHarnessRun(
  harnessDb: HarnessDb,
  sessionsDb: SessionsDb,
  harness: typeof harnesses.$inferSelect,
  trigger: "cron" | "manual",
  dueAt: Date,
  runTurn: AgentTurnRunner,
  summarizer?: SessionSummarizer,
): Promise<{ ran: boolean; runId?: string; error?: string }> {
  const fingerprint = trigger === "cron" && harness.cron ? cronFingerprint(harness.cron, dueAt) : null;

  if (fingerprint) {
    const [existing] = await harnessDb.db
      .select({ id: harnessRuns.id })
      .from(harnessRuns)
      .where(
        and(
          eq(harnessRuns.harnessId, harness.id),
          eq(harnessRuns.cronFingerprint, fingerprint),
        ),
      );
    if (existing) return { ran: false };
  }

  const [run] = await harnessDb.db
    .insert(harnessRuns)
    .values({
      harnessId: harness.id,
      clientId: harness.clientId,
      sessionId: harness.sessionId,
      status: "agent_running",
      trigger,
      cronFingerprint: fingerprint,
    })
    .returning();

  const message = resolveAgentMessage(harness.config as HarnessConfig);
  const agentResult = await runScheduledAgentMessage(
    sessionsDb,
    harness.sessionId,
    harness.clientId,
    { type: "agent_message", message },
    runTurn,
    summarizer,
  );

  const finishedAt = new Date();
  if (agentResult.ran) {
    await harnessDb.db
      .update(harnessRuns)
      .set({ status: "completed", finishedAt })
      .where(eq(harnessRuns.id, run!.id));
    await harnessDb.db
      .update(harnesses)
      .set({
        lastRunAt: finishedAt,
        nextRunAt: harness.cron ? computeNextCronRun(harness.cron, finishedAt) : null,
        updatedAt: finishedAt,
      })
      .where(eq(harnesses.id, harness.id));
    return { ran: true, runId: run!.id };
  }

  await harnessDb.db
    .update(harnessRuns)
    .set({
      status: "failed",
      error: agentResult.error ?? "agent_message did not run",
      finishedAt,
    })
    .where(eq(harnessRuns.id, run!.id));
  return { ran: false, runId: run!.id, error: agentResult.error };
}

export function startHarnessTick(
  harnessDb: HarnessDb,
  sessionsDb: SessionsDb,
  runTurn: AgentTurnRunner,
  summarizer?: SessionSummarizer,
  logger?: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void },
) {
  setInterval(async () => {
    const rows = await harnessDb.db.select().from(harnesses);
    const now = new Date();
    for (const harness of rows) {
      if (!harness.enabled || !harness.cron) continue;
      if (
        !isJobDue(
          {
            everySeconds: null,
            cron: harness.cron,
            nextRunAt: harness.nextRunAt,
            lastRunAt: harness.lastRunAt,
            createdAt: harness.createdAt,
          },
          now,
        )
      ) {
        continue;
      }

      logger?.info({ harness_id: harness.id, client_id: harness.clientId }, "harness tick");
      const result = await executeHarnessRun(
        harnessDb,
        sessionsDb,
        harness,
        "cron",
        harness.nextRunAt ?? now,
        runTurn,
        summarizer,
      );
      if (result.error) {
        logger?.warn(
          { harness_id: harness.id, error: result.error, run_id: result.runId },
          "harness run failed",
        );
      }
    }
  }, 5_000);
}
