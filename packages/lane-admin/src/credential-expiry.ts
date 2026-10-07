export type CredentialExpiryWarning = "none" | "soon" | "expired";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Warn when expires_at is within 14 days or already past. */
export function credentialExpiryWarning(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): CredentialExpiryWarning {
  if (!expiresAt) return "none";
  const exp = new Date(expiresAt);
  if (Number.isNaN(exp.getTime())) return "none";
  if (exp.getTime() <= now.getTime()) return "expired";
  if (exp.getTime() - now.getTime() <= 14 * MS_PER_DAY) return "soon";
  return "none";
}
