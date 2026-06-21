# Trajectory eval tooling (W10)

Lightweight checks on session trajectory — not a full LLM judge (deferred per design §13).

## API

| Endpoint | Purpose |
|----------|---------|
| `GET /v1/sessions/{id}/trajectory` | Raw events |
| `GET /v1/sessions/{id}/trajectory/replay` | Audit timeline + counts |

## Library (`@orbita/trajectory`)

```typescript
import { buildTrajectoryReplay, evaluateTrajectory } from "@orbita/trajectory";

const replay = buildTrajectoryReplay(events, sessionId);
console.log(replay.timeline_text);

const result = evaluateTrajectory(events, {
  require_turn_complete: true,
  required_tool_names: ["echo"],
});
```

## CLI scripts

**Replay timeline**

```bash
ORBITA_ADMIN_TOKEN=... ./scripts/replay-trajectory.sh <session_id>
```

**Eval expectations**

```bash
ORBITA_ADMIN_TOKEN=... EVAL_REQUIRED_TOOLS=echo ./scripts/eval-session.sh <session_id>
```

Environment:

| Variable | Default | Meaning |
|----------|---------|---------|
| `EVAL_REQUIRE_TURN_COMPLETE` | `1` | Require `turn_complete` event |
| `EVAL_MIN_EVENTS` | `1` | Minimum event count |
| `EVAL_REQUIRED_TOOLS` | empty | Comma-separated completed tool names |

## Smoke + eval flow

1. Run `scripts/smoke-prod.sh` (creates session + turn).
2. Copy `session_id` from output or trajectory call.
3. Run `eval-session.sh` on that session.

## CI

Nightly `smoke-prod` in `.github/workflows/e2e-nightly.yml` — extend with eval when session id is captured in smoke script (optional future).
