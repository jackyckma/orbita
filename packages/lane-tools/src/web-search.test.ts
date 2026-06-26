import { afterEach, describe, expect, it, vi } from "vitest";
import { loadWebSearchConfig, performWebSearch } from "./web-search.js";
import { setHttpToolPolicyOverride } from "./http-policy.js";

describe("web search", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setHttpToolPolicyOverride(null);
  });

  it("loads searxng as default provider", () => {
    expect(
      loadWebSearchConfig({
        ORBITA_WEB_SEARCH_PROVIDER: "",
        ORBITA_SEARXNG_BASE_URL: "https://search.example.com",
      }).provider,
    ).toBe("searxng");
  });

  it("searches via searxng json API", async () => {
    setHttpToolPolicyOverride({ allowedDomains: ["search.example.com"], timeoutMs: 5000 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          results: [
            {
              title: "Example",
              url: "https://example.com/post",
              content: "Practitioner notes on AI governance.",
            },
          ],
        }),
      ),
    );

    const out = await performWebSearch({
      query: "AI governance practitioner",
      resolveCredential: async () => {
        throw new Error("unused");
      },
      config: {
        provider: "searxng",
        searxngBaseUrl: "https://search.example.com",
      },
    });

    expect(out.provider).toBe("searxng");
    expect(out.results).toHaveLength(1);
    expect(out.results[0]?.url).toBe("https://example.com/post");
  });
});
