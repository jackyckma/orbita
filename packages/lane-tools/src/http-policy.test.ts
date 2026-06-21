import { describe, expect, it } from "vitest";
import { isHostnameAllowed, validateHttpsUrl } from "./http-policy.js";

describe("http policy", () => {
  it("allows all hosts when allow-list empty", () => {
    expect(isHostnameAllowed("api.example.com", [])).toBe(true);
  });

  it("matches exact and subdomain hosts", () => {
    const allowed = ["example.com"];
    expect(isHostnameAllowed("example.com", allowed)).toBe(true);
    expect(isHostnameAllowed("api.example.com", allowed)).toBe(true);
    expect(isHostnameAllowed("evil.com", allowed)).toBe(false);
  });

  it("rejects non-https URLs", () => {
    expect(() =>
      validateHttpsUrl("http://example.com", { allowedDomains: [], timeoutMs: 1000 }),
    ).toThrow(/https/i);
  });

  it("rejects disallowed hostnames", () => {
    expect(() =>
      validateHttpsUrl("https://evil.com/path", {
        allowedDomains: ["example.com"],
        timeoutMs: 1000,
      }),
    ).toThrow(/not allowed/i);
  });
});
