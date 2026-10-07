import { describe, expect, it, vi } from "vitest";
import type { CredentialsDb } from "./db/client.js";
import { decryptSecret } from "./crypto.js";
import {
  deleteCredential,
  replaceCredentialSecret,
  setCredentialExpiry,
} from "./service.js";

const SECRETS_KEY = "test-secrets-key-for-unit-tests";

function makeDb(initial: {
  id: string;
  clientId: string;
  name: string;
  secretCiphertext: string;
  scopes: string[];
  createdAt: Date;
  rotatedAt: Date | null;
  expiresAt: Date | null;
}) {
  let row = { ...initial };
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ id: row.id, scopes: row.scopes }]),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((vals: Partial<typeof row>) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            row = { ...row, ...vals };
            return [row];
          }),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => {
        row = null as never;
      }),
    })),
  };
  return { db: { db } as unknown as CredentialsDb, getRow: () => row };
}

describe("credential service rotation", () => {
  it("replace changes ciphertext and rotated_at but not name/scopes", async () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const { db, getRow } = makeDb({
      id: "cred-1",
      clientId: "personal-jacky",
      name: "github_read",
      secretCiphertext: "cipher-old",
      scopes: ["repo:read"],
      createdAt,
      rotatedAt: null,
      expiresAt: null,
    });

    const meta = await replaceCredentialSecret(
      db,
      SECRETS_KEY,
      "personal-jacky",
      "github_read",
      "new-token-value",
    );

    expect(meta.name).toBe("github_read");
    expect(meta.scopes).toEqual(["repo:read"]);
    expect(meta.rotated_at).not.toBeNull();
    const updated = getRow();
    expect(updated.secretCiphertext).not.toBe("cipher-old");
    expect(decryptSecret(updated.secretCiphertext, SECRETS_KEY)).toBe("new-token-value");
  });

  it("replace on missing credential is 404", async () => {
    const db = {
      db: {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => []),
            })),
          })),
        })),
      },
    } as unknown as CredentialsDb;

    await expect(
      replaceCredentialSecret(db, SECRETS_KEY, "personal-jacky", "missing", "x"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("setCredentialExpiry updates expires_at", async () => {
    const { db } = makeDb({
      id: "cred-2",
      clientId: "c",
      name: "n",
      secretCiphertext: "x",
      scopes: [],
      createdAt: new Date(),
      rotatedAt: null,
      expiresAt: null,
    });
    const exp = "2026-12-01T00:00:00.000Z";
    const meta = await setCredentialExpiry(db, "c", "n", new Date(exp));
    expect(meta.expires_at).toBe(exp);
  });

  it("delete removes credential row", async () => {
    const delWhere = vi.fn(async () => undefined);
    const db = {
      db: {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [{ id: "cred-3" }]),
            })),
          })),
        })),
        delete: vi.fn(() => ({ where: delWhere })),
      },
    } as unknown as CredentialsDb;

    await deleteCredential(db, "c", "n");
    expect(delWhere).toHaveBeenCalled();
  });
});
