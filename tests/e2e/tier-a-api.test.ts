import { describe, expect, it } from "vitest";

const BASE = process.env.E2E_API_URL ?? "http://127.0.0.1:3099";
const ADMIN = process.env.ORBITA_ADMIN_TOKEN ?? "e2e-admin-token";
const CLIENT = "e2e-tier-a";

async function adminCreateKey(): Promise<string> {
  const res = await fetch(`${BASE}/v1/admin/api-keys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-orbita-admin-token": ADMIN,
    },
    body: JSON.stringify({ allowed_client_ids: [CLIENT] }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { key: string };
  return body.key;
}

describe("e2e tier A — HTTP contracts (mock LLM)", () => {
  it("health returns ok", async () => {
    const res = await fetch(`${BASE}/v1/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("session message round-trip with mock runner", async () => {
    const apiKey = await adminCreateKey();
    const auth = {
      Authorization: `Bearer ${apiKey}`,
      "x-orbita-client-id": CLIENT,
    };

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
  });

  it("memory upsert without embedding keys", async () => {
    const apiKey = await adminCreateKey();
    const res = await fetch(`${BASE}/v1/memories/e2e-key`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "x-orbita-client-id": CLIENT,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: "tier-a memory" }),
    });
    expect(res.status).toBe(200);
  });
});
