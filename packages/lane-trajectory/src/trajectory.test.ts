import { describe, expect, it } from "vitest";
import { evaluateTrajectory } from "./eval.js";
import { buildTrajectoryReplay } from "./replay.js";

const sampleEvents = [
  {
    event_type: "tool_call_start",
    payload: { tool_name: "echo", args: { text: "hi" } },
    created_at: "2026-06-21T12:00:00.000Z",
  },
  {
    event_type: "tool_call_complete",
    payload: { tool_name: "echo", success: true, duration_ms: 12 },
    created_at: "2026-06-21T12:00:00.050Z",
  },
  {
    event_type: "turn_complete",
    payload: {
      execution_meta: { provider: "minimax", tool_calls_made: 1 },
      user_input: { type: "text", text: "hi" },
    },
    created_at: "2026-06-21T12:00:01.000Z",
  },
];

describe("buildTrajectoryReplay", () => {
  it("builds timeline with counts", () => {
    const replay = buildTrajectoryReplay(sampleEvents, "session-1");
    expect(replay.session_id).toBe("session-1");
    expect(replay.event_count).toBe(3);
    expect(replay.turn_count).toBe(1);
    expect(replay.tool_call_count).toBe(1);
    expect(replay.timeline_text).toContain("Tool start: echo");
    expect(replay.timeline_text).toContain("Turn complete");
  });
});

describe("evaluateTrajectory", () => {
  it("passes when expectations met", () => {
    const result = evaluateTrajectory(sampleEvents, {
      min_events: 2,
      require_turn_complete: true,
      required_event_types: ["tool_call_start", "tool_call_complete"],
      required_tool_names: ["echo"],
    });
    expect(result.pass).toBe(true);
    expect(result.checks.every((c) => c.pass)).toBe(true);
  });

  it("fails when tool missing", () => {
    const result = evaluateTrajectory(sampleEvents, {
      required_tool_names: ["http_get"],
    });
    expect(result.pass).toBe(false);
  });
});
