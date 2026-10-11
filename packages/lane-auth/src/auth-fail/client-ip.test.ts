import { describe, expect, it } from "vitest";
import { extractClientIp } from "./client-ip.js";

describe("extractClientIp", () => {
  it("uses the client hop when one trusted proxy is configured", () => {
    const ip = extractClientIp(
      { "x-forwarded-for": "203.0.113.9, 198.51.100.2" },
      1,
    );
    expect(ip).toBe("203.0.113.9");
  });

  it("ignores spoofed leftmost hops beyond trusted depth", () => {
    const ip = extractClientIp(
      { "x-forwarded-for": "10.0.0.99, 203.0.113.9, 198.51.100.2" },
      1,
    );
    expect(ip).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip", () => {
    expect(extractClientIp({ "x-real-ip": "203.0.113.5" }, 1)).toBe(
      "203.0.113.5",
    );
  });
});
