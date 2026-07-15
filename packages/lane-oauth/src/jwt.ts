import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64url");
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

export type AccessTokenClaims = {
  iss: string;
  aud: string;
  sub: string;
  scope: string;
  client_id: string;
  exp: number;
  iat: number;
};

export function signAccessToken(
  claims: Omit<AccessTokenClaims, "iat" | "exp"> & { ttlSeconds?: number },
  secret: string,
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessTokenClaims = {
    ...claims,
    iat: now,
    exp: now + (claims.ttlSeconds ?? 3600),
  };
  delete (payload as { ttlSeconds?: number }).ttlSeconds;

  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyAccessToken(
  token: string,
  secret: string,
  expectedAud: string,
): AccessTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  if (!header || !body || !sig) return null;

  const data = `${header}.${body}`;
  const expectedSig = createHmac("sha256", secret).update(data).digest();
  const actualSig = base64UrlDecode(sig);
  if (
    expectedSig.length !== actualSig.length ||
    !timingSafeEqual(expectedSig, actualSig)
  ) {
    return null;
  }

  let payload: AccessTokenClaims;
  try {
    payload = JSON.parse(base64UrlDecode(body).toString("utf8")) as AccessTokenClaims;
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return null;
  if (payload.aud !== expectedAud) return null;
  if (!payload.sub || !payload.scope) return null;
  return payload;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
