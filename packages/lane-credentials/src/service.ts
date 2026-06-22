import { and, eq } from "drizzle-orm";
import { conflict, notFound } from "@orbita/platform";
import { decryptSecret, encryptSecret } from "./crypto.js";
import type { CredentialsDb } from "./db/client.js";
import { credentials, type CredentialRow } from "./db/schema.js";

export type CreateCredentialInput = {
  clientId: string;
  name: string;
  secret: string;
  scopes: string[];
};

export async function createCredential(
  db: CredentialsDb,
  secretsKey: string,
  input: CreateCredentialInput,
): Promise<Omit<CredentialRow, "secretCiphertext">> {
  const existing = await db.db
    .select({ id: credentials.id })
    .from(credentials)
    .where(
      and(
        eq(credentials.clientId, input.clientId),
        eq(credentials.name, input.name),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    throw conflict(`Credential already exists: ${input.name}`);
  }

  const [row] = await db.db
    .insert(credentials)
    .values({
      clientId: input.clientId,
      name: input.name,
      secretCiphertext: encryptSecret(input.secret, secretsKey),
      scopes: input.scopes,
    })
    .returning({
      id: credentials.id,
      clientId: credentials.clientId,
      name: credentials.name,
      scopes: credentials.scopes,
      createdAt: credentials.createdAt,
    });

  if (!row) throw new Error("Failed to create credential");
  return row;
}

export async function listCredentials(
  db: CredentialsDb,
  clientId: string,
): Promise<Array<{ name: string; scopes: string[]; created_at: string }>> {
  const rows = await db.db
    .select()
    .from(credentials)
    .where(eq(credentials.clientId, clientId));
  return rows.map((row) => ({
    name: row.name,
    scopes: row.scopes,
    created_at: row.createdAt.toISOString(),
  }));
}

export async function listAllCredentials(
  db: CredentialsDb,
): Promise<Array<{ client_id: string; name: string; scopes: string[]; created_at: string }>> {
  const rows = await db.db.select().from(credentials);
  return rows.map((row) => ({
    client_id: row.clientId,
    name: row.name,
    scopes: row.scopes,
    created_at: row.createdAt.toISOString(),
  }));
}

export async function resolveCredentialSecret(
  db: CredentialsDb,
  secretsKey: string,
  clientId: string,
  name: string,
): Promise<string> {
  const [row] = await db.db
    .select()
    .from(credentials)
    .where(
      and(eq(credentials.clientId, clientId), eq(credentials.name, name)),
    )
    .limit(1);
  if (!row) {
    throw notFound(`Credential not found: ${name}`);
  }
  return decryptSecret(row.secretCiphertext, secretsKey);
}
