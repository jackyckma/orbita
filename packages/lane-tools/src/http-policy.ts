export type HttpToolPolicy = {
  allowedDomains: string[];
  timeoutMs: number;
};

export function loadHttpToolPolicy(
  source: NodeJS.ProcessEnv = process.env,
): HttpToolPolicy {
  const raw = source.ORBITA_HTTP_ALLOWED_DOMAINS?.trim();
  const allowedDomains = raw
    ? raw
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean)
    : [];
  const timeoutMs = Number(source.ORBITA_HTTP_TIMEOUT_MS ?? 30_000);
  return {
    allowedDomains,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000,
  };
}

export function isHostnameAllowed(hostname: string, allowedDomains: string[]): boolean {
  const host = hostname.toLowerCase();
  if (allowedDomains.length === 0) {
    return true;
  }
  for (const domain of allowedDomains) {
    if (host === domain || host.endsWith(`.${domain}`)) {
      return true;
    }
  }
  return false;
}

export function validateHttpsUrl(url: string, policy: HttpToolPolicy): URL {
  if (!url.startsWith("https://")) {
    throw new Error("Only https URLs are allowed");
  }
  const parsed = new URL(url);
  if (!isHostnameAllowed(parsed.hostname, policy.allowedDomains)) {
    throw new Error(`Host not allowed: ${parsed.hostname}`);
  }
  return parsed;
}
