import { describe, expect, it } from "vitest";
import { agentPrincipalsFeatureEnabled } from "./config.js";

describe("agentPrincipalsFeatureEnabled", () => {
  it("is false unless ORBITA_AGENT_PRINCIPALS_ENABLED=1", () => {
    expect(agentPrincipalsFeatureEnabled({})).toBe(false);
    expect(
      agentPrincipalsFeatureEnabled({ ORBITA_AGENT_PRINCIPALS_ENABLED: "0" }),
    ).toBe(false);
    expect(
      agentPrincipalsFeatureEnabled({ ORBITA_AGENT_PRINCIPALS_ENABLED: "1" }),
    ).toBe(true);
  });
});
