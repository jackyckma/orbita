import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Logger } from "@orbita/platform";

function ticketsEnabledFromEnv(): boolean {
  return process.env.ORBITA_TICKETS_ENABLED === "1";
}

function agentPrincipalsEnabledFromEnv(): boolean {
  return process.env.ORBITA_AGENT_PRINCIPALS_ENABLED === "1";
}

export async function runMigrations(
  databaseUrl: string,
  logger: Logger,
  options?: { ticketsEnabled?: boolean; agentPrincipalsEnabled?: boolean },
): Promise<void> {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = join(moduleDir, "..", "migrations");
  const initBody = readFileSync(join(migrationsDir, "init.sql"), "utf8");
  const ticketsEnabled = options?.ticketsEnabled ?? ticketsEnabledFromEnv();
  const agentPrincipalsEnabled =
    options?.agentPrincipalsEnabled ?? agentPrincipalsEnabledFromEnv();
  const client = postgres(databaseUrl, { max: 1 });
  try {
    await client.unsafe(initBody);
    logger.info("database migrations applied");
    if (ticketsEnabled) {
      const optionalBody = readFileSync(
        join(migrationsDir, "optional-tickets.sql"),
        "utf8",
      );
      await client.unsafe(optionalBody);
      logger.info("optional tickets migrations applied (ORBITA_TICKETS_ENABLED=1)");
    }
    if (agentPrincipalsEnabled) {
      const optionalBody = readFileSync(
        join(migrationsDir, "optional-agent-principals.sql"),
        "utf8",
      );
      await client.unsafe(optionalBody);
      logger.info(
        "optional agent principals migrations applied (ORBITA_AGENT_PRINCIPALS_ENABLED=1)",
      );
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}
