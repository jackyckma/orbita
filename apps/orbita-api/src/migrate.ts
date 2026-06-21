import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Logger } from "@orbita/platform";

export async function runMigrations(
  databaseUrl: string,
  logger: Logger,
): Promise<void> {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const sqlPath = join(moduleDir, "..", "migrations", "init.sql");
  const sqlBody = readFileSync(sqlPath, "utf8");
  const client = postgres(databaseUrl, { max: 1 });
  try {
    await client.unsafe(sqlBody);
    logger.info("database migrations applied");
  } finally {
    await client.end({ timeout: 5 });
  }
}
