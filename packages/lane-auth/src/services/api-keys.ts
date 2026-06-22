import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { AuthDb } from "../db/client.js";
import { apiKeys, type ApiKeyRow } from "../db/schema.js";

const KEY_PREFIX = "orb_";

export type CreateApiKeyInput = {
  allowedClientIds: string[];
  scopes: string[];
  expiresAt?: Date | null;
  rateLimitPerMinute?: number | null;
};

export type CreateApiKeyResult = {
  id: string;
  plaintextKey: string;
  keyPrefix: string;
  allowedClientIds: string[];
  scopes: string[];
  expiresAt: string | null;
  rateLimitPerMinute: number | null;
  createdAt: string;
};

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function generatePlaintextKey(): string {
  return `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export async function createApiKey(
  authDb: AuthDb,
  input: CreateApiKeyInput,
): Promise<CreateApiKeyResult> {
  const plaintextKey = generatePlaintextKey();
  const keyHash = hashApiKey(plaintextKey);
  const keyPrefix = plaintextKey.slice(0, 12);

  const [row] = await authDb.db
    .insert(apiKeys)
    .values({
      keyPrefix,
      keyHash,
      allowedClientIds: input.allowedClientIds,
      scopes: input.scopes,
      expiresAt: input.expiresAt ?? null,
      rateLimitPerMinute: input.rateLimitPerMinute ?? null,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create API key");
  }

  return toCreateResult(row, plaintextKey);
}

export async function revokeApiKey(
  authDb: AuthDb,
  keyId: string,
): Promise<boolean> {
  const [row] = await authDb.db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });

  return Boolean(row);
}

export type ApiKeySummary = {
  id: string;
  key_prefix: string;
  allowed_client_ids: string[];
  scopes: string[];
  expires_at: string | null;
  rate_limit_per_minute: number | null;
  created_at: string;
  revoked_at: string | null;
};

export async function listApiKeys(authDb: AuthDb): Promise<ApiKeySummary[]> {
  const rows = await authDb.db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt));
  return rows.map((row) => ({
    id: row.id,
    key_prefix: row.keyPrefix,
    allowed_client_ids: row.allowedClientIds,
    scopes: row.scopes,
    expires_at: row.expiresAt?.toISOString() ?? null,
    rate_limit_per_minute: row.rateLimitPerMinute,
    created_at: row.createdAt.toISOString(),
    revoked_at: row.revokedAt?.toISOString() ?? null,
  }));
}

export async function findActiveApiKeyByPlaintext(
  authDb: AuthDb,
  plaintext: string,
): Promise<ApiKeyRow | null> {
  const keyHash = hashApiKey(plaintext);
  const [row] = await authDb.db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
    .limit(1);

  if (!row) {
    return null;
  }

  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  return row;
}

export function isClientIdAllowed(
  row: ApiKeyRow,
  clientId: string,
): boolean {
  return row.allowedClientIds.includes(clientId);
}

function toCreateResult(
  row: ApiKeyRow,
  plaintextKey: string,
): CreateApiKeyResult {
  return {
    id: row.id,
    plaintextKey,
    keyPrefix: row.keyPrefix,
    allowedClientIds: row.allowedClientIds,
    scopes: row.scopes,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    rateLimitPerMinute: row.rateLimitPerMinute,
    createdAt: row.createdAt.toISOString(),
  };
}
