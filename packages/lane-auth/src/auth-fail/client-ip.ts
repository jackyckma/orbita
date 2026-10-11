export type ClientIpHeaders = {
  "x-forwarded-for"?: string;
  "x-real-ip"?: string;
};

/**
 * Derive the client IP behind a reverse proxy.
 * Only the rightmost `trustedProxyHops` entries from X-Forwarded-For are trusted;
 * client-supplied leftmost hops are ignored.
 */
export function extractClientIp(
  headers: ClientIpHeaders,
  trustedProxyHops: number,
): string {
  const forwarded = headers["x-forwarded-for"];
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      const hops = Math.max(0, trustedProxyHops);
      const index = Math.max(0, parts.length - 1 - hops);
      return parts[index] ?? parts[0]!;
    }
  }
  const realIp = headers["x-real-ip"]?.trim();
  if (realIp) {
    return realIp;
  }
  return "unknown";
}
