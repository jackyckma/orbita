import { describe, expect, it } from "vitest";
import { createCapabilitiesResponse } from "./runtime.js";

describe("agent", () => {
  it("exposes capabilities", () => {
    const caps = createCapabilitiesResponse();
    expect(caps.input_modes).toContain("text");
  });
});
