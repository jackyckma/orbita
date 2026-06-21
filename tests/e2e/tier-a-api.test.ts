import { describe, expect, it } from "vitest";
import { authHeaders, createApiKey, e2eBaseUrl } from "./helpers.js";

const BASE = e2eBaseUrl();
const CLIENT = "e2e-tier-a";
const runTierAHttp = process.env.E2E_TIER_A === "1";

describe.skipIf(!runTierAHttp)("e2e tier A — HTTP contracts (mock LLM)", () => {
  it("health returns ok", async () => {
    const res = await fetch(`${BASE}/v1/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("session message round-trip with mock runner", async () => {
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
      body: JSON.stringify({ input: { type: "text", text: "ping" } }),
    });
    expect(msgRes.status).toBe(200);
    const turn = (await msgRes.json()) as {
      assistant_message: { output: { natural_language: string } };
      execution_meta: { provider: string };
    };
    expect(turn.execution_meta.provider).toBe("e2e_mock");
    expect(turn.assistant_message.output.natural_language).toContain("E2E_MOCK:ping");

    const trajRes = await fetch(`${BASE}/v1/sessions/${session.id}/trajectory`, {
      headers: auth,
    });
    expect(trajRes.status).toBe(200);
    const traj = (await trajRes.json()) as { events: { event_type: string }[] };
    expect(traj.events.some((e) => e.event_type === "turn_complete")).toBe(true);
  });

  it("memory upsert without embedding keys", async () => {
    const apiKey = await createApiKey(CLIENT);
    const res = await fetch(`${BASE}/v1/memories/e2e-key`, {
      method: "PUT",
      headers: {
        ...authHeaders(apiKey, CLIENT),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: "tier-a memory" }),
    });
    expect(res.status).toBe(200);
  });

  it("cron job creation validates schedule", async () => {
    const apiKey = await createApiKey(CLIENT);
    const auth = authHeaders(apiKey, CLIENT);

    const sessionRes = await fetch(`${BASE}/v1/sessions`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ agent_profile: "default" }),
    });
    const { session } = (await sessionRes.json()) as { session: { id: string } };

    const jobRes = await fetch(`${BASE}/v1/sessions/${session.id}/jobs`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        cron: "0 * * * *",
        task: { type: "noop" },
        output_routing: { mode: "poll" },
      }),
    });
    expect(jobRes.status).toBe(201);
    const job = (await jobRes.json()) as { job: { cron: string; next_run_at: string | null } };
    expect(job.job.cron).toBe("0 * * * *");
    expect(job.job.next_run_at).toBeTruthy();
  });

  it("rate limit returns 429 when exceeded", async () => {
    const apiKey = await createApiKey(CLIENT, { rateLimitPerMinute: 1 });
    const auth = authHeaders(apiKey, CLIENT);

    const okRes = await fetch(`${BASE}/v1/whoami`, { headers: auth });
    expect(okRes.status).toBe(200);

    const limitedRes = await fetch(`${BASE}/v1/whoami`, { headers: auth });
    expect(limitedRes.status).toBe(429);
    const err = (await limitedRes.json()) as { error: { code: string } };
    expect(err.error.code).toBe("rate_limited");
    expect(limitedRes.headers.get("Retry-After")).toBeTruthy();
  });
});
