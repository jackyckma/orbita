export function e2eBaseUrl(): string {
  return process.env.E2E_API_URL ?? "http://127.0.0.1:3099";
}

export function e2eAdminToken(): string {
  return process.env.ORBITA_ADMIN_TOKEN ?? "e2e-admin-token";
}

export async function createApiKey(
  clientId: string,
  options?: { rateLimitPerMinute?: number },
): Promise<string> {
  const body: Record<string, unknown> = { allowed_client_ids: [clientId] };
  if (options?.rateLimitPerMinute != null) {
    body.rate_limit_per_minute = options.rateLimitPerMinute;
  }

  const res = await fetch(`${e2eBaseUrl()}/v1/admin/api-keys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-orbita-admin-token": e2eAdminToken(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`createApiKey failed: ${res.status} ${await res.text()}`);
  }
  const parsed = (await res.json()) as { key: string };
  return parsed.key;
}

export function authHeaders(apiKey: string, clientId: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "x-orbita-client-id": clientId,
  };
}
