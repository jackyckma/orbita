import { describe, expect, it } from "vitest";
import { parseKeyMandates } from "./config.js";

describe("parseKeyMandates", () => {
  it("returns empty map when unset", () => {
    expect(parseKeyMandates(undefined).size).toBe(0);
  });

  it("parses valid JSON map", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const map = parseKeyMandates(
      JSON.stringify({ "agent-key": [id] }),
    );
    expect(map.get("agent-key")).toEqual([id]);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseKeyMandates("{")).toThrow(/invalid JSON/);
  });
});
