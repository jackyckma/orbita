import { describe, expect, it } from "vitest";
import { createCapabilitiesResponse } from "./runtime.js";

describe("agent", () => {
  it("exposes capabilities with auth metadata", () => {
    const caps = createCapabilitiesResponse("http://127.0.0.1:3000");
    expect(caps.input_modes).toContain("text");
    expect(caps.auth?.caller?.type).toBe("api_key");
    expect(caps.auth?.admin?.device_flow?.start).toBe("POST /v1/auth/device");
  });
});
