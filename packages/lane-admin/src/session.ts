import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "orbita_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

type SessionPayload = {
  exp: number;
  iat: number;
};

function sign(payload: string, secretsKey: string): string {
  return createHmac("sha256", secretsKey).update(payload).digest("base64url");
}

export function createAdminSessionToken(secretsKey: string, now = Date.now()): string {
  const payload: SessionPayload = { iat: now, exp: now + SESSION_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = sign(body, secretsKey);
  return `${body}.${sig}`;
}

export function verifyAdminSessionToken(
  token: string | undefined,
  secretsKey: string,
  now = Date.now(),
): boolean {
  if (!token) {
    return false;
  }
  const [body, sig] = token.split(".");
  if (!body || !sig) {
    return false;
  }
  const expected = sign(body, secretsKey);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return false;
    }
  } catch {
    return false;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionPayload;
    return payload.exp > now;
  } catch {
    return false;
  }
}
