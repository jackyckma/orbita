import { describe, expect, it } from "vitest";

// Mirror private helper behavior via inline copy for regression test.
function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

describe("observability date parsing", () => {
  it("accepts postgres string timestamps", () => {
    const iso = toIso("2026-06-25T23:20:28.000Z");
    expect(iso).toBe("2026-06-25T23:20:28.000Z");
  });

  it("accepts Date objects", () => {
    const d = new Date("2026-06-25T23:20:28.000Z");
    expect(toIso(d)).toBe(d.toISOString());
  });

  it("returns null for missing values", () => {
    expect(toIso(null)).toBeNull();
    expect(toIso(undefined)).toBeNull();
  });
});
