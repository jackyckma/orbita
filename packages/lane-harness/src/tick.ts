import { and, eq } from "drizzle-orm";
import { computeNextCronRun, isJobDue, runScheduledAgentMessage } from "@orbita/scheduler";
import type { AgentTurnRunner, SessionSummarizer, SessionsDb } from "@orbita/sessions";
import type { MemoryDb } from "@orbita/memory";
import type { MemoryEnv } from "@orbita/memory";
import { resolveMemoryInject } from "@orbita/memory";
import type { HarnessDb } from "./db/client.js";
import { harnessRuns, harnesses } from "./db/schema.js";
import { resolveHarnessSessionForRun } from "./service.js";
import { resolveHarnessRunMessage } from "./templates.js";
import { resolveHarnessMemoryInjectForRun } from "./memory-inject.js";
import type { HarnessConfig } from "./types.js";

export type SystemCollectorContext = {
  clientId: string;
  harnessId: string;
  harnessName: string;
  dueAt: Date;
  config: HarnessConfig;
};

export type SystemCollectorRunner = (
  ctx: SystemCollectorContext,
) => Promise<{ ok: boolean; detail?: string; error?: string }>;

export type HarnessRunDeps = {
  memoryDb: MemoryDb;
  memoryEnv: MemoryEnv;
  /**
   * Deterministic collectors keyed by config.application.collector
   * (e.g. portfolio_git). Reuses harness cron/idempotency — no new scheduler.
   */
  systemCollectors?: Record<string, SystemCollectorRunner>;
};

function cronFingerprint(cron: string, dueAt: Date): string {
  return `${cron}:${dueAt.toISOString().slice(0, 16)}`;
}

export type HarnessRunResult = {
  ran: boolean;
  runId?: string;
  error?: string;
  /** Cron fingerprint already has a run for this dueAt. nextRunAt was advanced. */
  skipped?: { status: string; error: string | null };
};

/** Move a cron harness to the next slot. Does not touch lastRunAt. */
async function advanceCronNextRunAt(
  harnessDb: HarnessDb,
  harness: { id: string; cron: string | null; timezone?: string | null },
  trigger: "cron" | "manual",
  now: Date,
): Promise<void> {
  if (trigger !== "cron" || !harness.cron) return;
  await harnessDb.db
    .update(harnesses)
    .set({
      nextRunAt: computeNextCronRun(harness.cron, now, harness.timezone),
      updatedAt: now,
    })
    .where(eq(harnesses.id, harness.id));
}

export async function executeHarnessRun(
  harnessDb: HarnessDb,
  sessionsDb: SessionsDb,
  harness: typeof harnesses.$inferSelect,
  trigger: "cron" | "manual",
  dueAt: Date,
  runTurn: AgentTurnRunner,
  deps: HarnessRunDeps,
  summarizer?: SessionSummarizer,
): Promise<HarnessRunResult> {
  const fingerprint = trigger === "cron" && harness.cron ? cronFingerprint(harness.cron, dueAt) : null;

  if (fingerprint) {
    const [existing] = await harnessDb.db
      .select({
        id: harnessRuns.id,
        status: harnessRuns.status,
        error: harnessRuns.error,
      })
      .from(harnessRuns)
      .where(
        and(
          eq(harnessRuns.harnessId, harness.id),
          eq(harnessRuns.cronFingerprint, fingerprint),
        ),
      );
    if (existing) {
      const now = new Date();
      await advanceCronNextRunAt(harnessDb, harness, trigger, now);
      return {
        ran: false,
        runId: existing.id,
        skipped: { status: existing.status, error: existing.error },
      };
    }
  }

  const sessionId = await resolveHarnessSessionForRun(
    harnessDb,
    sessionsDb,
    deps.memoryDb,
    deps.memoryEnv,
    harness,
  );

  const config = harness.config as HarnessConfig;
  const collectorName =
    typeof config.application?.collector === "string"
      ? config.application.collector.trim()
      : "";

  const [run] = await harnessDb.db
    .insert(harnessRuns)
    .values({
      harnessId: harness.id,
      clientId: harness.clientId,
      sessionId,
      status: collectorName ? "collector_running" : "agent_running",
      trigger,
      cronFingerprint: fingerprint,
    })
    .returning();

  if (collectorName) {
    const runner = deps.systemCollectors?.[collectorName];
    const finishedAt = new Date();
    if (!runner) {
      const error = `No system collector registered: ${collectorName}`;
      await harnessDb.db
        .update(harnessRuns)
        .set({
          status: "failed",
          error,
          finishedAt,
        })
        .where(eq(harnessRuns.id, run!.id));
      await advanceCronNextRunAt(harnessDb, harness, trigger, new Date());
      return {
        ran: false,
        runId: run!.id,
        error,
      };
    }
    try {
      const result = await runner({
        clientId: harness.clientId,
        harnessId: harness.id,
        harnessName: harness.name,
        dueAt,
        config,
      });
      if (result.ok) {
        await harnessDb.db
          .update(harnessRuns)
          .set({ status: "completed", finishedAt })
          .where(eq(harnessRuns.id, run!.id));
        await harnessDb.db
          .update(harnesses)
          .set({
            lastRunAt: finishedAt,
            nextRunAt: harness.cron
              ? computeNextCronRun(harness.cron, finishedAt, harness.timezone)
              : null,
            updatedAt: finishedAt,
          })
          .where(eq(harnesses.id, harness.id));
        return { ran: true, runId: run!.id };
      }
      const error = result.error ?? "collector failed";
      await harnessDb.db
        .update(harnessRuns)
        .set({
          status: "failed",
          error,
          finishedAt,
        })
        .where(eq(harnessRuns.id, run!.id));
      await advanceCronNextRunAt(harnessDb, harness, trigger, new Date());
      return { ran: false, runId: run!.id, error };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await harnessDb.db
        .update(harnessRuns)
        .set({ status: "failed", error: message, finishedAt })
        .where(eq(harnessRuns.id, run!.id));
      await advanceCronNextRunAt(harnessDb, harness, trigger, new Date());
      return { ran: false, runId: run!.id, error: message };
    }
  }

  const message = resolveHarnessRunMessage(config, {
    templateId: harness.templateId,
    dueAt,
  });
  const injectConfig = resolveHarnessMemoryInjectForRun(harness);
  const harnessRunTurn: AgentTurnRunner = async (args) => {
    if (args.memoryContext !== undefined) {
      return runTurn(args);
    }
    if (!injectConfig) {
      return runTurn(args);
    }
    const memoryContext = await resolveMemoryInject(
      deps.memoryDb,
      harness.clientId,
      injectConfig,
      deps.memoryEnv,
      { queryText: message },
    );
    return runTurn({ ...args, memoryContext });
  };
  const agentResult = await runScheduledAgentMessage(
    sessionsDb,
    sessionId,
    harness.clientId,
    { type: "agent_message", message },
    harnessRunTurn,
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
        nextRunAt: harness.cron
          ? computeNextCronRun(harness.cron, finishedAt, harness.timezone)
          : null,
        updatedAt: finishedAt,
      })
      .where(eq(harnesses.id, harness.id));
    return { ran: true, runId: run!.id };
  }

  const error = agentResult.error ?? "agent_message did not run";
  await harnessDb.db
    .update(harnessRuns)
    .set({
      status: "failed",
      error,
      finishedAt,
    })
    .where(eq(harnessRuns.id, run!.id));
  await advanceCronNextRunAt(harnessDb, harness, trigger, new Date());
  return { ran: false, runId: run!.id, error };
}

export function startHarnessTick(
  harnessDb: HarnessDb,
  sessionsDb: SessionsDb,
  runTurn: AgentTurnRunner,
  deps: HarnessRunDeps,
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
      try {
        const result = await executeHarnessRun(
          harnessDb,
          sessionsDb,
          harness,
          "cron",
          harness.nextRunAt ?? now,
          runTurn,
          deps,
          summarizer,
        );
        if (result.skipped) {
          logger?.warn(
            {
              harness_id: harness.id,
              status: result.skipped.status,
              error: result.skipped.error,
            },
            "harness run skipped: already attempted for this slot; advanced next_run_at",
          );
        } else if (result.error) {
          logger?.warn(
            { harness_id: harness.id, error: result.error, run_id: result.runId },
            "harness run failed",
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger?.warn(
          { harness_id: harness.id, error: message },
          "harness tick run threw; advanced next_run_at and continuing",
        );
        try {
          await advanceCronNextRunAt(harnessDb, harness, "cron", new Date());
        } catch (advanceErr) {
          const advanceMessage =
            advanceErr instanceof Error ? advanceErr.message : String(advanceErr);
          logger?.warn(
            { harness_id: harness.id, error: advanceMessage },
            "harness tick failed to advance next_run_at after throw",
          );
        }
      }
    }
  }, 5_000);
}
