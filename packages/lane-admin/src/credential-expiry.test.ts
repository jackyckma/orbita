import { describe, expect, it } from "vitest";
import { credentialExpiryWarning } from "./credential-expiry.js";

describe("credentialExpiryWarning", () => {
  const now = new Date("2026-10-07T12:00:00.000Z");

  it("returns none when expiry is unset", () => {
    expect(credentialExpiryWarning(null, now)).toBe("none");
    expect(credentialExpiryWarning(undefined, now)).toBe("none");
  });

  it("returns expired when past", () => {
    expect(credentialExpiryWarning("2026-10-06T12:00:00.000Z", now)).toBe("expired");
  });

  it("returns soon within 14 days", () => {
    expect(credentialExpiryWarning("2026-10-20T12:00:00.000Z", now)).toBe("soon");
  });

  it("returns none when more than 14 days out", () => {
    expect(credentialExpiryWarning("2026-11-01T12:00:00.000Z", now)).toBe("none");
  });
});
