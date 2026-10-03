import { describe, expect, it } from "vitest";
import {
  assertHarnessPatchBody,
  collectJsonKeys,
  FORBIDDEN_HARNESS_RESPONSE_KEYS,
  type AdminHarnessRow,
} from "./harnesses.js";
import {
  formatHarnessSchedule,
  formatLastRunSummary,
  harnessEnabledLabel,
  harnessHelpLines,
  harnessToggleActionLabel,
} from "./harness-console.js";

describe("assertHarnessPatchBody", () => {
  it("accepts enabled and reason only", () => {
    expect(assertHarnessPatchBody({ enabled: false, reason: "maintenance" })).toEqual({
      enabled: false,
      reason: "maintenance",
    });
  });

  it("rejects extra fields", () => {
    expect(() =>
      assertHarnessPatchBody({ enabled: true, reason: "ok", cron: "0 * * * *" }),
    ).toThrow(/only enabled and reason/);
  });

  it("rejects empty reason", () => {
    expect(() => assertHarnessPatchBody({ enabled: true, reason: "   " })).toThrow(/reason/);
  });

  it("rejects reason over 200 chars", () => {
    expect(() =>
      assertHarnessPatchBody({ enabled: true, reason: "x".repeat(201) }),
    ).toThrow(/200/);
  });
});

describe("admin harness response shape", () => {
  it("sample row has no forbidden secret-like keys", () => {
    const row: AdminHarnessRow = {
      id: "00000000-0000-4000-8000-000000000001",
      client_id: "a",
      name: "n",
      template_id: "cron-agent",
      enabled: true,
      cron: "0 7 * * *",
      timezone: "UTC",
      next_run_at: null,
      last_run_at: null,
      session_policy: "sticky",
      latest_run: null,
    };
    const keys = collectJsonKeys(row);
    for (const forbidden of FORBIDDEN_HARNESS_RESPONSE_KEYS) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });
});

describe("harness console helpers", () => {
  it("labels enabled state", () => {
    expect(harnessEnabledLabel(true)).toBe("Enabled");
    expect(harnessEnabledLabel(false)).toBe("Paused");
    expect(harnessToggleActionLabel(true)).toBe("Pause");
    expect(harnessToggleActionLabel(false)).toBe("Resume");
  });

  it("formats schedule and last run", () => {
    expect(formatHarnessSchedule("0 7 * * *", "Asia/Taipei")).toContain("Asia/Taipei");
    expect(formatLastRunSummary(null)).toBe("—");
    expect(
      formatLastRunSummary({
        status: "succeeded",
        started_at: "2026-01-01T00:00:00.000Z",
        finished_at: "2026-01-01T00:01:00.000Z",
      }),
    ).toContain("succeeded");
  });

  it("exposes three help lines", () => {
    expect(harnessHelpLines()).toHaveLength(3);
    expect(harnessHelpLines()[2]).toContain("Pausing stops Orbita");
  });
});
