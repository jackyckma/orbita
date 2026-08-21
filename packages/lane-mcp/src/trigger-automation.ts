import { resolveCredentialSecret } from "@orbita/credentials";
import type { CredentialsDb } from "@orbita/credentials";
import type { MemoryDb, MemoryEnv } from "@orbita/memory";
import { upsertNote } from "@orbita/memory";
import { OrbitaError } from "@orbita/platform";

export type AutomationLane = "maker" | "checker";

export function credentialNameForLane(lane: AutomationLane): string {
  return lane === "maker"
    ? "cursor_webhook_orbita_maker"
    : "cursor_webhook_orbita_checker";
}

/**
 * The stored credential secret. Cursor's "Webhook Triggered" automation
 * trigger, once the automation is saved, hands back TWO separate pieces:
 * a webhook URL and a bearer API key sent as an `Authorization: Bearer
 * <key>` header — Cursor does NOT accept the key embedded in the URL as a
 * query param. Since Orbita's credential vault stores exactly one secret
 * string per credential name, the founder stores both combined as a JSON
 * object: {"url": "<webhook url>", "key": "<bearer key>"}.
 *
 * Kept liberal on purpose: a bare non-JSON string is still accepted and
 * treated as a URL with no Authorization header, so an older stored value
 * (or a future Cursor trigger type that turns out to need no auth at all)
 * still degrades to "send the request, just unauthenticated" rather than
 * failing outright. Malformed/partial JSON is treated the same way — never
 * throw here; a bad credential value should surface as a normal webhook
 * failure (caught downstream by the fetch call), not as an unrelated parse
 * error.
 */
export function parseWebhookCredential(secret: string): {
  url: string;
  key?: string;
} {
  try {
    const parsed: unknown = JSON.parse(secret);
    if (
      parsed &&
      typeof parsed === "object" &&
      "url" in parsed &&
      typeof (parsed as { url: unknown }).url === "string"
    ) {
      const key = (parsed as { key?: unknown }).key;
      return {
        url: (parsed as { url: string }).url,
        key: typeof key === "string" && key.length > 0 ? key : undefined,
      };
    }
  } catch {
    // Not JSON — fall through to treating the whole string as a bare URL.
  }
  return { url: secret };
}

export type WriteAuditNote = (
  db: MemoryDb,
  clientId: string,
  input: {
    title: string;
    body: string;
    frontmatter: Record<string, unknown>;
  },
  env: MemoryEnv,
) => Promise<{ id: string }>;

export type TriggerAutomationDeps = {
  clientId: string;
  credentialsDb: CredentialsDb;
  secretsKey: string;
  memoryDb: MemoryDb;
  memoryEnv: MemoryEnv;
  webhookFetch?: typeof fetch;
  resolveCredential?: typeof resolveCredentialSecret;
  writeNote?: WriteAuditNote;
};

export type TriggerAutomationInput = {
  lane: AutomationLane;
  reason: string;
};

export type TriggerAutomationSuccess = {
  ok: true;
  outcome: "sent";
  note_id: string;
  credential_name: string;
};

export type TriggerAutomationCredentialMissing = {
  ok: false;
  kind: "credential_missing";
  credential_name: string;
  message: string;
};

export type TriggerAutomationWebhookFailed = {
  ok: false;
  kind: "webhook_failed";
  outcome: "failed";
  note_id: string;
  credential_name: string;
  message: string;
};

export type TriggerAutomationInvalidInput = {
  ok: false;
  kind: "invalid_input";
  message: string;
};

export type TriggerAutomationResult =
  | TriggerAutomationSuccess
  | TriggerAutomationCredentialMissing
  | TriggerAutomationWebhookFailed
  | TriggerAutomationInvalidInput;

export async function executeTriggerAutomation(
  deps: TriggerAutomationDeps,
  input: TriggerAutomationInput,
): Promise<TriggerAutomationResult> {
  if (!input.reason.trim()) {
    return {
      ok: false,
      kind: "invalid_input",
      message: "reason must be a non-empty string",
    };
  }

  const credentialName = credentialNameForLane(input.lane);
  const resolveCredential = deps.resolveCredential ?? resolveCredentialSecret;
  const writeNote: WriteAuditNote =
    deps.writeNote ??
    (async (db, clientId, input, env) => {
      const note = await upsertNote(db, clientId, input, env);
      return { id: note.id };
    });
  const fetchFn = deps.webhookFetch ?? fetch;
  const triggeredAt = new Date().toISOString();

  let webhookSecret: string;
  try {
    webhookSecret = await resolveCredential(
      deps.credentialsDb,
      deps.secretsKey,
      deps.clientId,
      credentialName,
    );
  } catch (err) {
    if (err instanceof OrbitaError && err.code === "not_found") {
      return {
        ok: false,
        kind: "credential_missing",
        credential_name: credentialName,
        message: err.message,
      };
    }
    throw err;
  }

  const { url: webhookUrl, key: webhookKey } =
    parseWebhookCredential(webhookSecret);

  let outcome: "sent" | "failed" = "sent";
  let failureDetail: string | undefined;

  try {
    const headers: Record<string, string> = {};
    if (webhookKey) {
      headers.Authorization = `Bearer ${webhookKey}`;
    }
    const response = await fetchFn(webhookUrl, { method: "POST", headers });
    if (!response.ok) {
      outcome = "failed";
      failureDetail = `Webhook returned HTTP ${response.status}`;
    }
  } catch (err) {
    outcome = "failed";
    failureDetail =
      err instanceof Error ? err.message : "Webhook request failed";
  }

  const frontmatter: Record<string, unknown> = {
    type: "instruction",
    project: "orbita",
    lane: input.lane,
    reason: input.reason,
    triggered_at: triggeredAt,
    outcome,
    ...(failureDetail ? { failure: failureDetail } : {}),
  };

  const body = `Triggered ${input.lane} automation: ${input.reason}. Outcome: ${outcome}${
    failureDetail ? ` (${failureDetail})` : ""
  }.`;

  const note = await writeNote(
    deps.memoryDb,
    deps.clientId,
    {
      title: `Automation trigger (${input.lane})`,
      body,
      frontmatter,
    },
    deps.memoryEnv,
  );

  if (outcome === "failed") {
    return {
      ok: false,
      kind: "webhook_failed",
      outcome: "failed",
      note_id: note.id,
      credential_name: credentialName,
      message: failureDetail ?? "Webhook request failed",
    };
  }

  return {
    ok: true,
    outcome: "sent",
    note_id: note.id,
    credential_name: credentialName,
  };
}
