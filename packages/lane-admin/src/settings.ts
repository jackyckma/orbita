import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import type { HttpToolPolicy } from "@orbita/tools";
import { loadHttpToolPolicy, setHttpToolPolicyOverride } from "@orbita/tools";

const deploymentSettings = pgTable("deployment_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminDb = {
  db: ReturnType<typeof drizzle>;
  sql: ReturnType<typeof postgres>;
};

export function createAdminDb(databaseUrl: string): AdminDb {
  const sql = postgres(databaseUrl, { max: 4 });
  return { sql, db: drizzle(sql) };
}

export async function closeAdminDb(adminDb: AdminDb): Promise<void> {
  await adminDb.sql.end({ timeout: 5 });
}

const HTTP_DOMAINS_KEY = "http_allowed_domains";

export async function loadDeploymentHttpPolicy(
  adminDb: AdminDb,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HttpToolPolicy> {
  const base = loadHttpToolPolicy(env);
  try {
    const [row] = await adminDb.db
      .select()
      .from(deploymentSettings)
      .where(eq(deploymentSettings.key, HTTP_DOMAINS_KEY))
      .limit(1);
    if (row?.value && Array.isArray(row.value)) {
      const domains = row.value.filter((d): d is string => typeof d === "string");
      const policy = { ...base, allowedDomains: domains };
      setHttpToolPolicyOverride(policy);
      return policy;
    }
  } catch {
    // table may not exist during tests
  }
  setHttpToolPolicyOverride(null);
  return base;
}

export async function getHttpAllowedDomains(
  adminDb: AdminDb,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ domains: string[]; source: "database" | "environment" | "none" }> {
  try {
    const [row] = await adminDb.db
      .select()
      .from(deploymentSettings)
      .where(eq(deploymentSettings.key, HTTP_DOMAINS_KEY))
      .limit(1);
    if (row?.value && Array.isArray(row.value)) {
      return {
        domains: row.value.filter((d): d is string => typeof d === "string"),
        source: "database",
      };
    }
  } catch {
    // ignore
  }
  const raw = env.ORBITA_HTTP_ALLOWED_DOMAINS?.trim();
  if (raw) {
    return {
      domains: raw
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean),
      source: "environment",
    };
  }
  return { domains: [], source: "none" };
}

export async function setHttpAllowedDomains(
  adminDb: AdminDb,
  domains: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<string[]> {
  const normalized = domains.map((d) => d.trim().toLowerCase()).filter(Boolean);
  await adminDb.db
    .insert(deploymentSettings)
    .values({
      key: HTTP_DOMAINS_KEY,
      value: normalized,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: deploymentSettings.key,
      set: { value: normalized, updatedAt: new Date() },
    });
  const base = loadHttpToolPolicy(env);
  const policy = { ...base, allowedDomains: normalized };
  setHttpToolPolicyOverride(policy);
  return normalized;
}
