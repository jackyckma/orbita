import { describe, expect, it } from "vitest";
import { authHeaders, createApiKey, e2eBaseUrl } from "./helpers.js";

const BASE = e2eBaseUrl();
const CLIENT = "e2e-tier-b";
const runTierB = process.env.E2E_LLM === "1";

describe.skipIf(!runTierB)("e2e tier B — live MiniMax", () => {
  it("agent turn uses minimax provider", async () => {
    const apiKey = await createApiKey(CLIENT);
    const auth = authHeaders(apiKey, CLIENT);

    const sessionRes = await fetch(`${BASE}/v1/sessions`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ agent_profile: "default" }),
    });
    expect(sessionRes.status).toBe(201);
    const { session } = (await sessionRes.json()) as { session: { id: string } };

    const msgRes = await fetch(`${BASE}/v1/sessions/${session.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        input: {
          type: "text",
          text: "Use echo with text LIVE_OK and reply with only the echoed value.",
        },
      }),
    });
    expect(msgRes.status).toBe(200);
    const turn = (await msgRes.json()) as {
      assistant_message: { output: { natural_language: string } };
      execution_meta: { provider: string; tool_calls_made?: number };
    };
    expect(turn.execution_meta.provider).toBe("minimax");
    expect(turn.execution_meta.tool_calls_made ?? 0).toBeGreaterThanOrEqual(1);
    expect(turn.assistant_message.output.natural_language).toMatch(/LIVE_OK/i);
  }, 60_000);

  it("trajectory records turn_complete after live turn", async () => {
    const apiKey = await createApiKey(CLIENT);
    const auth = authHeaders(apiKey, CLIENT);

    const sessionRes = await fetch(`${BASE}/v1/sessions`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ agent_profile: "default" }),
    });
    const { session } = (await sessionRes.json()) as { session: { id: string } };

    const msgRes = await fetch(`${BASE}/v1/sessions/${session.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        input: {
          type: "text",
          text: "Use echo with text TRAJ_OK and reply with only the echoed value.",
        },
      }),
    });
    expect(msgRes.status).toBe(200);

    const trajRes = await fetch(`${BASE}/v1/sessions/${session.id}/trajectory`, {
      headers: auth,
    });
    expect(trajRes.status).toBe(200);
    const traj = (await trajRes.json()) as { events: { event_type: string }[] };
    expect(traj.events.some((e) => e.event_type === "turn_complete")).toBe(true);
  }, 60_000);
});
