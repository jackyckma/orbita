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

  let webhookUrl: string;
  try {
    webhookUrl = await resolveCredential(
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

  let outcome: "sent" | "failed" = "sent";
  let failureDetail: string | undefined;

  try {
    const response = await fetchFn(webhookUrl, { method: "POST" });
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
