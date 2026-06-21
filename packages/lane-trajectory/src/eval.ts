import type { TrajectoryEventRecord } from "./replay.js";

export type TrajectoryEvalExpectation = {
  min_events?: number;
  required_event_types?: string[];
  required_tool_names?: string[];
  require_turn_complete?: boolean;
};

export type TrajectoryEvalCheck = {
  name: string;
  pass: boolean;
  detail?: string;
};

export type TrajectoryEvalResult = {
  pass: boolean;
  checks: TrajectoryEvalCheck[];
};

export function evaluateTrajectory(
  events: TrajectoryEventRecord[],
  expectation: TrajectoryEvalExpectation,
): TrajectoryEvalResult {
  const checks: TrajectoryEvalCheck[] = [];
  const eventTypes = events.map((e) => e.event_type);

  if (expectation.min_events != null) {
    const pass = events.length >= expectation.min_events;
    checks.push({
      name: "min_events",
      pass,
      detail: `count=${events.length}, min=${expectation.min_events}`,
    });
  }

  if (expectation.require_turn_complete) {
    const pass = eventTypes.includes("turn_complete");
    checks.push({
      name: "require_turn_complete",
      pass,
      detail: pass ? undefined : "missing turn_complete",
    });
  }

  for (const requiredType of expectation.required_event_types ?? []) {
    const pass = eventTypes.includes(requiredType);
    checks.push({
      name: `event_type:${requiredType}`,
      pass,
      detail: pass ? undefined : `missing ${requiredType}`,
    });
  }

  if (expectation.required_tool_names?.length) {
    const toolNames = events
      .filter((e) => e.event_type === "tool_call_complete")
      .map((e) => String(e.payload.tool_name ?? ""));
    for (const name of expectation.required_tool_names) {
      const pass = toolNames.includes(name);
      checks.push({
        name: `tool:${name}`,
        pass,
        detail: pass ? undefined : `tool ${name} not completed`,
      });
    }
  }

  const pass = checks.every((c) => c.pass);
  return { pass, checks };
}
