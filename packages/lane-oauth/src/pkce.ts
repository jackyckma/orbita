import { createHash } from "node:crypto";

export function verifyPkceS256(
  codeVerifier: string,
  codeChallenge: string,
): boolean {
  if (!codeVerifier || !codeChallenge) return false;
  const digest = createHash("sha256").update(codeVerifier).digest("base64url");
  return digest === codeChallenge;
}
