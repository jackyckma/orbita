import type { HttpToolPolicy } from "./http-policy.js";
import { loadHttpToolPolicy, validateHttpsUrl } from "./http-policy.js";

export type HttpRequestOptions = {
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  credentialRef?: string;
  resolveCredential: (name: string) => Promise<string>;
  policy?: HttpToolPolicy;
};

export async function performHttpRequest(options: HttpRequestOptions): Promise<{
  status: number;
  ok: boolean;
  body_preview: string;
}> {
  const policy = options.policy ?? loadHttpToolPolicy();
  validateHttpsUrl(options.url, policy);

  const headers: Record<string, string> = { ...options.headers };
  if (options.credentialRef) {
    const secret = await options.resolveCredential(options.credentialRef);
    headers.Authorization = `Bearer ${secret}`;
  }

  const response = await fetch(options.url, {
    method: options.method,
    headers,
    body: options.method === "POST" ? options.body : undefined,
    signal: AbortSignal.timeout(policy.timeoutMs),
  });
  const body = await response.text();
  return {
    status: response.status,
    ok: response.ok,
    body_preview: body.slice(0, 2000),
  };
}
