import { describe, expect, it } from "vitest";
import {
  getEffectiveHttpToolPolicy,
  isHostnameAllowed,
  setHttpToolPolicyOverride,
} from "./http-policy.js";

describe("http policy override", () => {
  it("uses override when set", () => {
    setHttpToolPolicyOverride({ allowedDomains: ["example.com"], timeoutMs: 5000 });
    const policy = getEffectiveHttpToolPolicy({});
    expect(policy.allowedDomains).toEqual(["example.com"]);
    setHttpToolPolicyOverride(null);
  });
});

describe("isHostnameAllowed", () => {
  it("allows subdomain match", () => {
    expect(isHostnameAllowed("api.example.com", ["example.com"])).toBe(true);
  });

  it("blocks unknown host when list set", () => {
    expect(isHostnameAllowed("evil.com", ["example.com"])).toBe(false);
  });
});
