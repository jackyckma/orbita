import { getEffectiveHttpToolPolicy, validateHttpsUrl } from "./http-policy.js";

export type WebSearchProvider = "searxng" | "tavily";

export type WebSearchConfig = {
  provider: WebSearchProvider;
  searxngBaseUrl: string;
};

export type WebSearchOptions = {
  query: string;
  maxResults?: number;
  credentialRef?: string;
  resolveCredential: (name: string) => Promise<string>;
  config?: WebSearchConfig;
};

export type WebSearchResult = {
  query: string;
  provider: WebSearchProvider;
  results: Array<{ title: string; url: string; snippet: string }>;
};

export function loadWebSearchConfig(
  source: NodeJS.ProcessEnv = process.env,
): WebSearchConfig {
  const raw = (source.ORBITA_WEB_SEARCH_PROVIDER ?? "searxng").trim().toLowerCase();
  const provider: WebSearchProvider = raw === "tavily" ? "tavily" : "searxng";
  return {
    provider,
    searxngBaseUrl: (source.ORBITA_SEARXNG_BASE_URL ?? "").trim().replace(/\/$/, ""),
  };
}

function clampMaxResults(maxResults?: number): number {
  return Math.min(Math.max(maxResults ?? 5, 1), 10);
}

async function searchSearxng(
  baseUrl: string,
  query: string,
  maxResults: number,
): Promise<WebSearchResult> {
  if (!baseUrl) {
    throw new Error(
      "SearXNG not configured — set ORBITA_SEARXNG_BASE_URL on the Orbita API service",
    );
  }

  const endpoint = new URL("/search", `${baseUrl}/`);
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("language", "en");

  validateHttpsUrl(endpoint.toString(), getEffectiveHttpToolPolicy());

  const response = await fetch(endpoint, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(getEffectiveHttpToolPolicy().timeoutMs),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Web search failed (${response.status}): ${body.slice(0, 300)}`);
  }

  let parsed: { results?: Array<{ title?: string; url?: string; content?: string }> };
  try {
    parsed = JSON.parse(body) as typeof parsed;
  } catch {
    throw new Error("SearXNG returned invalid JSON — ensure format=json is enabled");
  }

  const results = (parsed.results ?? []).slice(0, maxResults).map((row) => ({
    title: String(row.title ?? ""),
    url: String(row.url ?? ""),
    snippet: String(row.content ?? "").slice(0, 1500),
  }));

  return { query, provider: "searxng", results };
}

async function searchTavily(
  options: WebSearchOptions,
  query: string,
  maxResults: number,
): Promise<WebSearchResult> {
  const tavilyUrl = "https://api.tavily.com/search";
  validateHttpsUrl(tavilyUrl, getEffectiveHttpToolPolicy());

  const credName = options.credentialRef?.trim() || "tavily_search";
  const apiKey = await options.resolveCredential(credName);

  const response = await fetch(tavilyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      include_answer: false,
      include_raw_content: true,
    }),
    signal: AbortSignal.timeout(getEffectiveHttpToolPolicy().timeoutMs),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Web search failed (${response.status}): ${body.slice(0, 300)}`);
  }

  let parsed: { results?: Array<{ title?: string; url?: string; content?: string }> };
  try {
    parsed = JSON.parse(body) as typeof parsed;
  } catch {
    throw new Error("Web search returned invalid JSON");
  }

  const results = (parsed.results ?? []).map((row) => ({
    title: String(row.title ?? ""),
    url: String(row.url ?? ""),
    snippet: String(row.content ?? "").slice(0, 1500),
  }));

  return { query, provider: "tavily", results };
}

export async function performWebSearch(options: WebSearchOptions): Promise<WebSearchResult> {
  const query = options.query.trim();
  if (!query) {
    throw new Error("query is required");
  }

  const config = options.config ?? loadWebSearchConfig();
  const maxResults = clampMaxResults(options.maxResults);

  if (config.provider === "tavily") {
    return searchTavily(options, query, maxResults);
  }

  return searchSearxng(config.searxngBaseUrl, query, maxResults);
}
