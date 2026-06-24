import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./service.js";

describe("waitlist service", () => {
  it("normalizes email", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
  });
});
