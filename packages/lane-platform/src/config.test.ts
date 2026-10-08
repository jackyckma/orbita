import { describe, expect, it } from "vitest";
import { PlatformEnvSchema } from "./config.js";

describe("ORBITA_MCP_ACCESS_LOG", () => {
  it("accepts only 0 or 1 and leaves the flag unset by default", () => {
    expect(PlatformEnvSchema.parse({}).ORBITA_MCP_ACCESS_LOG).toBeUndefined();
    expect(PlatformEnvSchema.parse({ ORBITA_MCP_ACCESS_LOG: "1" }).ORBITA_MCP_ACCESS_LOG).toBe("1");
    expect(PlatformEnvSchema.parse({ ORBITA_MCP_ACCESS_LOG: "0" }).ORBITA_MCP_ACCESS_LOG).toBe("0");
    expect(() => PlatformEnvSchema.parse({ ORBITA_MCP_ACCESS_LOG: "true" })).toThrow();
    expect(() => PlatformEnvSchema.parse({ ORBITA_MCP_ACCESS_LOG: "" })).toThrow();
  });
});
