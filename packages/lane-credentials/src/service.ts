import { and, eq } from "drizzle-orm";
import { conflict, notFound } from "@orbita/platform";
import { formatCredentialMetadata } from "./credential-meta.js";
import { decryptSecret, encryptSecret } from "./crypto.js";
import type { CredentialsDb } from "./db/client.js";
import { credentials, type CredentialRow } from "./db/schema.js";

const credentialMetaSelect = {
  clientId: credentials.clientId,
  name: credentials.name,
  scopes: credentials.scopes,
  createdAt: credentials.createdAt,
  rotatedAt: credentials.rotatedAt,
  expiresAt: credentials.expiresAt,
};

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
      rotatedAt: credentials.rotatedAt,
      expiresAt: credentials.expiresAt,
    });

  if (!row) throw new Error("Failed to create credential");
  return row;
}

export async function listCredentials(
  db: CredentialsDb,
  clientId: string,
): Promise<Array<Omit<ReturnType<typeof formatCredentialMetadata>, "client_id">>> {
  const rows = await db.db
    .select(credentialMetaSelect)
    .from(credentials)
    .where(eq(credentials.clientId, clientId));
  return rows.map((row) => {
    const meta = formatCredentialMetadata(row);
    const { client_id: _c, ...rest } = meta;
    return rest;
  });
}

export async function listAllCredentials(
  db: CredentialsDb,
): Promise<Array<ReturnType<typeof formatCredentialMetadata>>> {
  const rows = await db.db.select(credentialMetaSelect).from(credentials);
  return rows.map((row) => formatCredentialMetadata(row));
}

export async function replaceCredentialSecret(
  db: CredentialsDb,
  secretsKey: string,
  clientId: string,
  name: string,
  secret: string,
): Promise<ReturnType<typeof formatCredentialMetadata>> {
  const [existing] = await db.db
    .select({ id: credentials.id, scopes: credentials.scopes })
    .from(credentials)
    .where(and(eq(credentials.clientId, clientId), eq(credentials.name, name)))
    .limit(1);
  if (!existing) {
    throw notFound(`Credential not found: ${name}`);
  }

  const rotatedAt = new Date();
  const [row] = await db.db
    .update(credentials)
    .set({
      secretCiphertext: encryptSecret(secret, secretsKey),
      rotatedAt,
    })
    .where(eq(credentials.id, existing.id))
    .returning(credentialMetaSelect);

  if (!row) throw new Error("Failed to rotate credential");
  return formatCredentialMetadata(row);
}

export async function deleteCredential(
  db: CredentialsDb,
  clientId: string,
  name: string,
): Promise<void> {
  const [existing] = await db.db
    .select({ id: credentials.id })
    .from(credentials)
    .where(and(eq(credentials.clientId, clientId), eq(credentials.name, name)))
    .limit(1);
  if (!existing) {
    throw notFound(`Credential not found: ${name}`);
  }
  await db.db.delete(credentials).where(eq(credentials.id, existing.id));
}

export async function setCredentialExpiry(
  db: CredentialsDb,
  clientId: string,
  name: string,
  expiresAt: Date | null,
): Promise<ReturnType<typeof formatCredentialMetadata>> {
  const [existing] = await db.db
    .select({ id: credentials.id })
    .from(credentials)
    .where(and(eq(credentials.clientId, clientId), eq(credentials.name, name)))
    .limit(1);
  if (!existing) {
    throw notFound(`Credential not found: ${name}`);
  }

  const [row] = await db.db
    .update(credentials)
    .set({ expiresAt })
    .where(eq(credentials.id, existing.id))
    .returning(credentialMetaSelect);

  if (!row) throw new Error("Failed to update credential expiry");
  return formatCredentialMetadata(row);
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
