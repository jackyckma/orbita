import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { AdminDb } from "./settings.js";
import { createAdminSessionToken } from "./session.js";

const deviceAuth = pgTable("device_auth_requests", {
  deviceCode: text("device_code").primaryKey(),
  userCode: text("user_code").notNull().unique(),
  status: text("status").notNull().default("pending"),
  sessionToken: text("session_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

const DEVICE_TTL_MS = 10 * 60 * 1000;

function randomCode(length: number): string {
  return randomBytes(length).toString("base64url").slice(0, length).toUpperCase();
}

export type DeviceStartResult = {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
};

export async function startDeviceAuth(
  adminDb: AdminDb,
  publicBaseUrl: string,
): Promise<DeviceStartResult> {
  const deviceCode = randomCode(32);
  const userCode = randomCode(8);
  const expiresAt = new Date(Date.now() + DEVICE_TTL_MS);

  await adminDb.db.insert(deviceAuth).values({
    deviceCode,
    userCode,
    expiresAt,
  });

  const base = publicBaseUrl.replace(/\/$/, "");
  return {
    device_code: deviceCode,
    user_code: userCode,
    verification_url: `${base}/admin/device?user_code=${userCode}`,
    expires_in: Math.floor(DEVICE_TTL_MS / 1000),
    interval: 5,
  };
}

export async function approveDeviceAuth(
  adminDb: AdminDb,
  userCode: string,
  secretsKey: string,
): Promise<boolean> {
  const now = new Date();
  const sessionToken = createAdminSessionToken(secretsKey, now.getTime());
  const [row] = await adminDb.db
    .update(deviceAuth)
    .set({
      status: "approved",
      sessionToken,
      approvedAt: now,
    })
    .where(
      and(
        eq(deviceAuth.userCode, userCode.toUpperCase()),
        eq(deviceAuth.status, "pending"),
        gt(deviceAuth.expiresAt, now),
      ),
    )
    .returning({ deviceCode: deviceAuth.deviceCode });

  return Boolean(row);
}

export type DevicePollResult =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "approved"; session_token: string };

export async function pollDeviceAuth(
  adminDb: AdminDb,
  deviceCode: string,
): Promise<DevicePollResult> {
  const now = new Date();
  const [row] = await adminDb.db
    .select()
    .from(deviceAuth)
    .where(eq(deviceAuth.deviceCode, deviceCode))
    .limit(1);

  if (!row || row.expiresAt.getTime() <= now.getTime()) {
    return { status: "expired" };
  }

  if (row.status === "approved" && row.sessionToken) {
    await adminDb.db
      .update(deviceAuth)
      .set({ sessionToken: null })
      .where(eq(deviceAuth.deviceCode, deviceCode));
    return { status: "approved", session_token: row.sessionToken };
  }

  return { status: "pending" };
}
