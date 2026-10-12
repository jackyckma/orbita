import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { AuthDb } from "../db/client.js";
import { apiKeys, type ApiKeyRow } from "../db/schema.js";

const KEY_PREFIX = "orb_";
export const API_KEY_LABEL_MAX_LENGTH = 80;

export type ApiKeyLifecycleState = "active" | "expired" | "revoked";

export type CreateApiKeyInput = {
  allowedClientIds: string[];
  scopes: string[];
  label?: string | null;
  purpose?: string | null;
  expiresAt?: Date | null;
  rateLimitPerMinute?: number | null;
};

export type CreateApiKeyResult = {
  id: string;
  plaintextKey: string;
  keyPrefix: string;
  label: string | null;
  purpose: string | null;
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

export function normalizeApiKeyLabel(label: string | null | undefined): string | null {
  if (label == null) {
    return null;
  }
  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function validateApiKeyLabel(label: string | null | undefined): string | null {
  return normalizeApiKeyLabel(label);
}

export function normalizeApiKeyPurpose(purpose: string | null | undefined): string | null {
  if (purpose == null) {
    return null;
  }
  const trimmed = purpose.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isApiKeyUnlabelled(label: string | null | undefined): boolean {
  return normalizeApiKeyLabel(label) === null;
}

export function deriveApiKeyState(row: ApiKeyRow, now = new Date()): ApiKeyLifecycleState {
  if (row.revokedAt) {
    return "revoked";
  }
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return "active";
}

/** Prefix for audit logs when only a bearer token is available (never log the full token). */
export function bearerKeyPrefix(bearer: string): string {
  return bearer.slice(0, 12);
}

/** Fields safe to attach to auth-failure audit logs alongside key_prefix. */
export function apiKeyAuditFields(
  row: Pick<ApiKeyRow, "keyPrefix" | "label"> | null,
  bearer?: string | null,
): { key_prefix: string | null; key_label: string | null } {
  if (row) {
    return {
      key_prefix: row.keyPrefix,
      key_label: normalizeApiKeyLabel(row.label),
    };
  }
  if (bearer && bearer.startsWith(KEY_PREFIX)) {
    return { key_prefix: bearerKeyPrefix(bearer), key_label: null };
  }
  return { key_prefix: null, key_label: null };
}

export async function createApiKey(
  authDb: AuthDb,
  input: CreateApiKeyInput,
): Promise<CreateApiKeyResult> {
  const label = validateApiKeyLabel(input.label);
  const purpose = normalizeApiKeyPurpose(input.purpose);

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
      label,
      purpose,
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

export type PatchApiKeyInput = {
  label?: string | null;
  purpose?: string | null;
};

export async function patchApiKey(
  authDb: AuthDb,
  keyId: string,
  input: PatchApiKeyInput,
): Promise<ApiKeySummary | null> {
  const updates: Partial<Pick<ApiKeyRow, "label" | "purpose">> = {};
  if (input.label !== undefined) {
    updates.label = validateApiKeyLabel(input.label);
  }
  if (input.purpose !== undefined) {
    updates.purpose = normalizeApiKeyPurpose(input.purpose);
  }
  if (Object.keys(updates).length === 0) {
    const [existing] = await authDb.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, keyId))
      .limit(1);
    return existing ? toSummary(existing) : null;
  }

  const [row] = await authDb.db
    .update(apiKeys)
    .set(updates)
    .where(eq(apiKeys.id, keyId))
    .returning();

  return row ? toSummary(row) : null;
}

export type ApiKeySummary = {
  id: string;
  key_prefix: string;
  label: string | null;
  purpose: string | null;
  unlabelled: boolean;
  allowed_client_ids: string[];
  scopes: string[];
  expires_at: string | null;
  rate_limit_per_minute: number | null;
  created_at: string;
  revoked_at: string | null;
  state: ApiKeyLifecycleState;
};

export async function listApiKeys(authDb: AuthDb): Promise<ApiKeySummary[]> {
  const rows = await authDb.db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt));
  return rows.map((row) => toSummary(row));
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

function toSummary(row: ApiKeyRow): ApiKeySummary {
  const label = normalizeApiKeyLabel(row.label);
  return {
    id: row.id,
    key_prefix: row.keyPrefix,
    label,
    purpose: normalizeApiKeyPurpose(row.purpose),
    unlabelled: label === null,
    allowed_client_ids: row.allowedClientIds,
    scopes: row.scopes,
    expires_at: row.expiresAt?.toISOString() ?? null,
    rate_limit_per_minute: row.rateLimitPerMinute,
    created_at: row.createdAt.toISOString(),
    revoked_at: row.revokedAt?.toISOString() ?? null,
    state: deriveApiKeyState(row),
  };
}

function toCreateResult(
  row: ApiKeyRow,
  plaintextKey: string,
): CreateApiKeyResult {
  return {
    id: row.id,
    plaintextKey,
    keyPrefix: row.keyPrefix,
    label: normalizeApiKeyLabel(row.label),
    purpose: normalizeApiKeyPurpose(row.purpose),
    allowedClientIds: row.allowedClientIds,
    scopes: row.scopes,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    rateLimitPerMinute: row.rateLimitPerMinute,
    createdAt: row.createdAt.toISOString(),
  };
}
