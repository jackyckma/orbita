import type { sessionJobs } from "./db/schema.js";

type JobRow = typeof sessionJobs.$inferSelect;

export type WebhookDeliveryResult = {
  ok: boolean;
  status?: number;
  error?: string;
};

export async function deliverJobWebhook(
  job: JobRow,
  payload: Record<string, unknown>,
): Promise<WebhookDeliveryResult> {
  if (job.outputRouting.mode !== "webhook") {
    return { ok: true };
  }
  const url = job.outputRouting.webhook_url;
  if (!url) {
    return { ok: false, error: "missing webhook_url" };
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return { ok: false, status: response.status, error: `HTTP ${response.status}` };
    }
    return { ok: true, status: response.status };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
