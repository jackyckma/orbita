import { desc, eq } from "drizzle-orm";
import { conflict, notFound } from "@orbita/platform";
import type { AuthDb } from "@orbita/auth";
import { createApiKey } from "@orbita/auth";
import type { WaitlistEnv } from "./config.js";
import type { WaitlistDb } from "./db/client.js";
import { waitlistEntries, type WaitlistEntryRow } from "./db/schema.js";
import { sendWaitlistInviteEmail } from "./invite.js";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type WaitlistEntryJson = {
  id: string;
  email: string;
  message: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
};

export function entryToJson(row: WaitlistEntryRow): WaitlistEntryJson {
  return {
    id: row.id,
    email: row.email,
    message: row.message,
    status: row.status,
    notes: row.notes,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    approved_at: row.approvedAt?.toISOString() ?? null,
  };
}

export async function createWaitlistEntry(
  db: WaitlistDb,
  input: { email: string; message?: string },
): Promise<WaitlistEntryJson> {
  const email = normalizeEmail(input.email);
  const message = input.message?.trim() || null;
  try {
    const [row] = await db.db
      .insert(waitlistEntries)
      .values({ email, message })
      .returning();
    return entryToJson(row!);
  } catch (err) {
    if (err instanceof Error && /unique|duplicate/i.test(err.message)) {
      throw conflict("Email already on waitlist");
    }
    throw err;
  }
}

export async function listWaitlistEntries(
  db: WaitlistDb,
  status?: string,
): Promise<WaitlistEntryJson[]> {
  const rows = await db.db
    .select()
    .from(waitlistEntries)
    .where(status ? eq(waitlistEntries.status, status) : undefined)
    .orderBy(desc(waitlistEntries.createdAt))
    .limit(200);
  return rows.map(entryToJson);
}

export async function updateWaitlistEntry(
  db: WaitlistDb,
  id: string,
  input: { status: "pending" | "approved" | "rejected"; notes?: string },
): Promise<WaitlistEntryJson> {
  const now = new Date();
  const approvedAt = input.status === "approved" ? now : null;
  const [row] = await db.db
    .update(waitlistEntries)
    .set({
      status: input.status,
      notes: input.notes?.trim() || null,
      updatedAt: now,
      approvedAt,
    })
    .where(eq(waitlistEntries.id, id))
    .returning();
  if (!row) {
    throw notFound("Waitlist entry not found");
  }
  return entryToJson(row);
}

export type ApproveWaitlistResult = {
  entry: WaitlistEntryJson;
  api_key?: string;
  invite_sent: boolean;
};

export async function approveWaitlistEntryWithInvite(
  waitlistDb: WaitlistDb,
  authDb: AuthDb,
  env: WaitlistEnv,
  id: string,
  input: { client_id?: string; send_invite?: boolean; notes?: string },
): Promise<ApproveWaitlistResult> {
  const [existing] = await waitlistDb.db
    .select()
    .from(waitlistEntries)
    .where(eq(waitlistEntries.id, id))
    .limit(1);
  if (!existing) {
    throw notFound("Waitlist entry not found");
  }
  if (existing.status === "approved") {
    throw conflict("Waitlist entry already approved");
  }

  const entry = await updateWaitlistEntry(waitlistDb, id, {
    status: "approved",
    notes: input.notes,
  });

  const clientId =
    input.client_id?.trim() ||
    env.ORBITA_WAITLIST_INVITE_CLIENT_ID?.trim() ||
    `waitlist-${entry.id.slice(0, 8)}`;

  const keyResult = await createApiKey(authDb, {
    allowedClientIds: [clientId],
    scopes: ["sessions:create", "sessions:use"],
  });

  let inviteSent = false;
  if (input.send_invite && env.ZEABUR_ZSEND_API_KEY && env.ORBITA_INSTANCE_FROM_EMAIL) {
    const apiBase = env.ORBITA_PUBLIC_BASE_URL?.replace(/\/$/, "") || "https://api.get-orbita.com";
    await sendWaitlistInviteEmail({
      apiKey: keyResult.plaintextKey,
      fromEmail: env.ORBITA_INSTANCE_FROM_EMAIL,
      toEmail: entry.email,
      zsendApiKey: env.ZEABUR_ZSEND_API_KEY,
      apiBaseUrl: apiBase,
    });
    inviteSent = true;
  }

  return {
    entry,
    api_key: keyResult.plaintextKey,
    invite_sent: inviteSent,
  };
}

export async function ensureWaitlistSchema(db: WaitlistDb): Promise<void> {
  await db.client.unsafe(`
    CREATE TABLE IF NOT EXISTS waitlist_entries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL,
      message text,
      status text NOT NULL DEFAULT 'pending',
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      approved_at timestamptz
    );
    CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_email_lower_unique
      ON waitlist_entries (lower(email));
  `);
}
