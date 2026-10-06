import { describe, expect, it } from "vitest";
import { shouldMountTicketRoutes } from "./tickets-mount.js";

describe("shouldMountTicketRoutes", () => {
  it("is false unless ORBITA_TICKETS_ENABLED=1", () => {
    expect(shouldMountTicketRoutes({})).toBe(false);
    expect(
      shouldMountTicketRoutes({ ORBITA_TICKETS_ENABLED: "0" }),
    ).toBe(false);
    expect(
      shouldMountTicketRoutes({ ORBITA_TICKETS_ENABLED: "1" }),
    ).toBe(true);
  });
});
