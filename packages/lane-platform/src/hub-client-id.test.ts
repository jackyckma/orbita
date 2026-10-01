import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEPRECATED_HUB_CLIENT_ID_FALLBACK,
  resetHubClientIdWarningForTests,
  resolveHubClientId,
} from "./hub-client-id.js";

describe("resolveHubClientId", () => {
  afterEach(() => {
    resetHubClientIdWarningForTests();
  });

  it("returns explicit ORBITA_HUB_CLIENT_ID when set", () => {
    const warn = vi.fn();
    expect(
      resolveHubClientId(
        { ORBITA_HUB_CLIENT_ID: "tenant-acme" },
        { warn },
      ),
    ).toBe("tenant-acme");
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns fallback and warns once when env is unset", () => {
    const warn = vi.fn();
    expect(resolveHubClientId({}, { warn })).toBe(
      DEPRECATED_HUB_CLIENT_ID_FALLBACK,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("deprecated default tenant in use");

    expect(resolveHubClientId({}, { warn })).toBe(
      DEPRECATED_HUB_CLIENT_ID_FALLBACK,
    );
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
