import { describe, expect, it } from "vitest";
import { buildTrajectoryReplay } from "../../packages/lane-trajectory/src/replay.js";
import { evaluateTrajectory } from "../../packages/lane-trajectory/src/eval.js";

describe("e2e tier A — trajectory replay contracts", () => {
  it("evaluates fixture trajectory", () => {
    const events = [
      {
        event_type: "turn_complete",
        payload: { execution_meta: { provider: "e2e_mock" } },
        created_at: "2026-06-21T00:00:00.000Z",
      },
    ];
    const replay = buildTrajectoryReplay(events);
    expect(replay.turn_count).toBe(1);
    const evalResult = evaluateTrajectory(events, { require_turn_complete: true });
    expect(evalResult.pass).toBe(true);
  });
});
