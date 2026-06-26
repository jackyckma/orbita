import { describe, expect, it } from "vitest";
import type { QuotaLimits } from "./quota.js";

describe("quota limits", () => {
  it("zero limits mean disabled", () => {
    const limits: QuotaLimits = { sessionsPerDay: 0, messagesPerDay: 0 };
    expect(limits.sessionsPerDay).toBe(0);
    expect(limits.messagesPerDay).toBe(0);
  });
});
