import { describe, expect, it } from "vitest";
import { isDockerSandboxEnabled } from "./docker.js";

describe("docker sandbox", () => {
  it("disabled by default", () => {
    expect(isDockerSandboxEnabled({})).toBe(false);
    expect(isDockerSandboxEnabled({ ORBITA_SANDBOX_DOCKER: "1" })).toBe(true);
  });
});
