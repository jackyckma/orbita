import { afterEach, describe, expect, it, vi } from "vitest";
import { deliverJobWebhook } from "./webhook.js";

const baseJob = {
  id: "job-1",
  sessionId: "sess-1",
  clientId: "client-1",
  everySeconds: 60,
  cron: null,
  nextRunAt: null,
  task: { intent: "ping" },
  outputRouting: { mode: "webhook" as const, webhook_url: "https://example.com/hook" },
  enabled: true,
  lastRunAt: null,
  createdAt: new Date(),
};

describe("deliverJobWebhook", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs JSON to webhook_url", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await deliverJobWebhook(baseJob, { job_id: "job-1" });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("swallows non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const result = await deliverJobWebhook(baseJob, {});
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
  });
});
