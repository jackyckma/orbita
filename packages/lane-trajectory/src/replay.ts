export type TrajectoryEventRecord = {
  id?: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type TrajectoryReplayStep = {
  index: number;
  event_type: string;
  created_at: string;
  summary: string;
  payload: Record<string, unknown>;
};

export type TrajectoryReplay = {
  event_count: number;
  turn_count: number;
  tool_call_count: number;
  steps: TrajectoryReplayStep[];
  timeline_text: string;
};

function summarizeEvent(event: TrajectoryEventRecord): string {
  const type = event.event_type;
  const payload = event.payload;

  switch (type) {
    case "turn_complete": {
      const meta = payload.execution_meta as Record<string, unknown> | undefined;
      const provider = meta?.provider ?? "unknown";
      const tools = meta?.tool_calls_made ?? 0;
      return `Turn complete (provider=${provider}, tool_calls=${tools})`;
    }
    case "tool_call_start": {
      const name = payload.tool_name ?? "unknown";
      return `Tool start: ${name}`;
    }
    case "tool_call_complete": {
      const name = payload.tool_name ?? "unknown";
      const ok = payload.success === true;
      const ms = payload.duration_ms;
      return `Tool ${ok ? "ok" : "fail"}: ${name}${ms != null ? ` (${ms}ms)` : ""}`;
    }
    case "scheduled_job_tick":
      return "Scheduler job tick";
    default:
      return type;
  }
}

export function buildTrajectoryReplay(
  events: TrajectoryEventRecord[],
  sessionId?: string,
): TrajectoryReplay & { session_id?: string } {
  const steps: TrajectoryReplayStep[] = events.map((event, index) => ({
    index,
    event_type: event.event_type,
    created_at: event.created_at,
    summary: summarizeEvent(event),
    payload: event.payload,
  }));

  const turn_count = events.filter((e) => e.event_type === "turn_complete").length;
  const tool_call_count = events.filter((e) => e.event_type === "tool_call_complete").length;
  const timeline_lines = steps.map(
    (step) => `[${step.created_at}] ${step.index + 1}. ${step.summary}`,
  );

  const replay: TrajectoryReplay & { session_id?: string } = {
    event_count: events.length,
    turn_count,
    tool_call_count,
    steps,
    timeline_text: timeline_lines.join("\n"),
  };
  if (sessionId) {
    replay.session_id = sessionId;
  }
  return replay;
}
