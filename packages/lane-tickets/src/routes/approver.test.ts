import { describe, expect, it } from "vitest";
import { isApproverKeyAllowed, requiresApproverGate } from "./approver.js";

describe("approver allowlist", () => {
  it("denies everyone when allowlist is empty", () => {
    expect(isApproverKeyAllowed("key-1", new Set())).toBe(false);
    expect(isApproverKeyAllowed("oauth", new Set())).toBe(false);
  });

  it("allows only listed api key ids", () => {
    const allow = new Set(["key-approver"]);
    expect(isApproverKeyAllowed("key-approver", allow)).toBe(true);
    expect(isApproverKeyAllowed("oauth", allow)).toBe(false);
  });

  it("allows oauth only when explicitly listed", () => {
    const allow = new Set(["oauth"]);
    expect(isApproverKeyAllowed("oauth", allow)).toBe(true);
  });

  it("requires gate for approve and proposed cancel only", () => {
    expect(requiresApproverGate("ticket_approve")).toBe(true);
    expect(requiresApproverGate("ticket_cancel", "proposed")).toBe(true);
    expect(requiresApproverGate("ticket_cancel", "active")).toBe(false);
    expect(requiresApproverGate("ticket_claim")).toBe(false);
  });
});
