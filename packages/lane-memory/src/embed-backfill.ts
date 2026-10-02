import type { MemoryEnv } from "./config.js";
import type { MemoryDb } from "./db/client.js";
import type { EmbedFailureReason } from "./embed.js";
import { isRateLimitEmbedFailure } from "./embed-breaker.js";
import { embedFailureReason, embedText, formatVectorLiteral } from "./embed.js";
import { noteEmbedText } from "./notes-service.js";

export type EmbedBackfillLogger = {
  info: (obj: Record<string, unknown>, msg?: string) => void;
};

export const EMBED_BACKFILL_RATE_LIMIT_WAIT_MS = 5 * 60 * 1000;

export function isEmbedBackfillEnabled(
  source: NodeJS.ProcessEnv = process.env,
): boolean {
  return source.ORBITA_EMBED_BACKFILL === "1";
}

export type EmbedBackfillConfig = {
  enabled: boolean;
  rpm: number;
  intervalMinutes: number;
  rateLimitWaitMs: number;
};

export function loadEmbedBackfillConfig(
  source: NodeJS.ProcessEnv = process.env,
): EmbedBackfillConfig {
  const rpmParsed = Number(source.ORBITA_EMBED_BACKFILL_RPM);
  const intervalParsed = Number(source.ORBITA_EMBED_BACKFILL_INTERVAL_MINUTES);
  return {
    enabled: isEmbedBackfillEnabled(source),
    rpm: Number.isFinite(rpmParsed) && rpmParsed > 0 ? rpmParsed : 3,
    intervalMinutes:
      Number.isFinite(intervalParsed) && intervalParsed > 0
        ? intervalParsed
        : 10,
    rateLimitWaitMs: EMBED_BACKFILL_RATE_LIMIT_WAIT_MS,
  };
}

type NoteBackfillRow = {
  id: string;
  client_id: string;
  title: string | null;
  body: string;
};

async function countNotesWithoutEmbedding(db: MemoryDb): Promise<number> {
  const rows = await db.client<{ count: number }[]>`
    SELECT count(*)::int AS count FROM notes WHERE embedding IS NULL
  `;
  return rows[0]?.count ?? 0;
}

async function listNotesWithoutEmbedding(
  db: MemoryDb,
  limit: number,
): Promise<NoteBackfillRow[]> {
  return db.client<NoteBackfillRow[]>`
    SELECT id, client_id, title, body
    FROM notes
    WHERE embedding IS NULL
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;
}

async function persistNoteEmbedding(
  db: MemoryDb,
  note: NoteBackfillRow,
  embedding: number[],
): Promise<void> {
  const literal = formatVectorLiteral(embedding);
  await db.client.unsafe(
    `UPDATE notes SET embedding = $1::vector
     WHERE id = $2 AND client_id = $3 AND embedding IS NULL`,
    [literal, note.id, note.client_id],
  );
}

export function embedBackfillStopReason(
  failure: EmbedFailureReason | null,
): string | null {
  if (!failure) {
    return null;
  }
  if (failure.reason === "rate_limited_breaker") {
    return "rate_limited_breaker";
  }
  if (isRateLimitEmbedFailure(failure)) {
    if (failure.reason === "http_error") {
      return `http_status:${failure.httpStatus}`;
    }
    if (failure.reason === "minimax_status") {
      return `base_resp_error:${failure.statusCode}`;
    }
  }
  return null;
}

export type EmbedBackfillPassResult = {
  processed: number;
  remaining: number;
  lastReason: string;
};

export type EmbedBackfillPassDeps = {
  sleep: (ms: number) => Promise<void>;
  delayBetweenEmbedsMs: (rpm: number) => number;
};

const defaultPassDeps: EmbedBackfillPassDeps = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  delayBetweenEmbedsMs: (rpm) => Math.ceil(60_000 / rpm),
};

export async function runEmbedBackfillPass(
  db: MemoryDb,
  env: MemoryEnv,
  logger: EmbedBackfillLogger,
  config: EmbedBackfillConfig,
  deps: EmbedBackfillPassDeps = defaultPassDeps,
): Promise<EmbedBackfillPassResult> {
  let processed = 0;
  let lastReason = "none";
  const candidates = await listNotesWithoutEmbedding(db, 500);
  const delayMs = deps.delayBetweenEmbedsMs(config.rpm);

  for (let index = 0; index < candidates.length; index += 1) {
    const note = candidates[index]!;
    const embedding = await embedText(
      env,
      noteEmbedText(note.title, note.body),
      { purpose: "db" },
    );

    if (embedding) {
      await persistNoteEmbedding(db, note, embedding);
      processed += 1;
      lastReason = "ok";
    } else {
      const stop = embedBackfillStopReason(embedFailureReason);
      if (stop) {
        lastReason = stop;
        await deps.sleep(config.rateLimitWaitMs);
        break;
      }
      lastReason = embedFailureReason
        ? `skipped:${embedFailureReason.reason}`
        : "skipped:unknown";
    }

    if (index + 1 < candidates.length) {
      await deps.sleep(delayMs);
    }
  }

  const remaining = await countNotesWithoutEmbedding(db);
  logger.info(
    {
      event: "embedding_backfill_pass",
      processed,
      remaining,
      last_reason: lastReason,
    },
    "embedding backfill pass complete",
  );

  return { processed, remaining, lastReason };
}

let backfillTimer: ReturnType<typeof setInterval> | null = null;

export function startEmbedBackfill(
  db: MemoryDb,
  env: MemoryEnv,
  logger: EmbedBackfillLogger,
  source: NodeJS.ProcessEnv = process.env,
): void {
  const config = loadEmbedBackfillConfig(source);
  if (!config.enabled) {
    return;
  }
  if (backfillTimer) {
    return;
  }

  const intervalMs = config.intervalMinutes * 60 * 1000;
  let passInFlight = false;

  const tick = () => {
    if (passInFlight) {
      return;
    }
    passInFlight = true;
    void runEmbedBackfillPass(db, env, logger, config)
      .catch((error) => {
        logger.info(
          {
            event: "embedding_backfill_pass_error",
            error_class: error instanceof Error ? error.name : "Error",
            message: (error instanceof Error ? error.message : "unknown").slice(
              0,
              200,
            ),
          },
          "embedding backfill pass failed",
        );
      })
      .finally(() => {
        passInFlight = false;
      });
  };

  backfillTimer = setInterval(tick, intervalMs);
  tick();
}

export function resetEmbedBackfillForTests(): void {
  if (backfillTimer) {
    clearInterval(backfillTimer);
    backfillTimer = null;
  }
}
