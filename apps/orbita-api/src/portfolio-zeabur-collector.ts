import {
  collectPortfolioZeaburReports,
  defaultCollectPeriod,
  type CollectPortfolioZeaburResult,
} from "@orbita/portfolio";
import type { CredentialsDb } from "@orbita/credentials";
import { resolveCredentialSecret } from "@orbita/credentials";
import type { MemoryDb, MemoryEnv } from "@orbita/memory";
import { getMemoryByKey, upsertMemory, upsertNote } from "@orbita/memory";
import type { SystemCollectorRunner } from "@orbita/harness";

const HUB_CLIENT_ID = "personal-jacky";
const DEFAULT_CREDENTIAL = "zeabur_api";

export function createPortfolioZeaburCollector(deps: {
  credentialsDb: CredentialsDb;
  secretsKey: string;
  memoryDb: MemoryDb;
  memoryEnv: MemoryEnv;
  logger?: {
    info: (obj: object, msg: string) => void;
    warn: (obj: object, msg: string) => void;
  };
}): SystemCollectorRunner {
  return async (ctx) => {
    const clientId = ctx.clientId || HUB_CLIENT_ID;
    const app = (ctx.config.application ?? {}) as Record<string, unknown>;
    const credentialName =
      typeof app.credential_name === "string" && app.credential_name.trim()
        ? app.credential_name.trim()
        : DEFAULT_CREDENTIAL;
    const periodHours =
      typeof app.period_hours === "number" && app.period_hours > 0
        ? app.period_hours
        : 24;

    const until = ctx.dueAt;
    const since = new Date(until.getTime() - periodHours * 3600 * 1000);
    const period =
      periodHours === 24
        ? defaultCollectPeriod(until)
        : { since: since.toISOString(), until: until.toISOString() };

    // Resolve secret server-side — never log it.
    const token = await resolveCredentialSecret(
      deps.credentialsDb,
      deps.secretsKey,
      clientId,
      credentialName,
    );

    const result: CollectPortfolioZeaburResult =
      await collectPortfolioZeaburReports({
        clientId,
        period,
        token,
        putNote: async (input) => {
          const note = await upsertNote(
            deps.memoryDb,
            clientId,
            input,
            deps.memoryEnv,
          );
          return { id: note.id };
        },
        previousAskForProject: async (slug) => {
          const key = `portfolio/${slug}/deploy/last_ask`;
          const content = await getMemoryByKey(deps.memoryDb, clientId, key);
          return content && content.trim() ? content.trim() : null;
        },
      });

    for (const report of result.reports) {
      const ask =
        report.sections.find((s) => s.id === "ask")?.body?.trim() || "none";
      await upsertMemory(
        deps.memoryDb,
        clientId,
        `portfolio/${report.project}/deploy/last_ask`,
        ask,
        deps.memoryEnv,
      );
    }

    deps.logger?.info(
      {
        harness_id: ctx.harnessId,
        notes: result.noteIds.length,
        failures: result.failures.length,
        skipped: result.skipped.length,
        projects: result.reports.map((r) => ({
          project: r.project,
          status: r.status,
          sha_confidence: r.sha_confidence,
        })),
      },
      "portfolio_zeabur collect finished",
    );

    if (result.noteIds.length === 0) {
      return {
        ok: false,
        error:
          result.failures[0]?.error ?? "portfolio_zeabur produced no notes",
      };
    }
    return {
      ok: true,
      detail: `notes=${result.noteIds.length}; failures=${result.failures.length}; skipped=${result.skipped.length}`,
    };
  };
}
