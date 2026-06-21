import { describe, expect, it } from "vitest";
import { isOverLimit, retryAfterSeconds, windowStartForMinute } from "./window.js";

describe("rate limit window", () => {
  it("buckets to minute start", () => {
    const now = new Date("2026-06-21T12:30:45.123Z");
    const start = windowStartForMinute(now);
    expect(start.toISOString()).toBe("2026-06-21T12:30:00.000Z");
  });

  it("computes retry-after until next window", () => {
    const now = new Date("2026-06-21T12:30:45Z");
    expect(retryAfterSeconds(now)).toBe(15);
  });

  it("over limit when count exceeds budget", () => {
    expect(isOverLimit(121, 120)).toBe(true);
    expect(isOverLimit(120, 120)).toBe(false);
  });
});
