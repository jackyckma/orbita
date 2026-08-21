import { describe, expect, it, vi } from "vitest";
import { OrbitaError } from "@orbita/platform";
import {
  credentialNameForLane,
  executeTriggerAutomation,
  parseWebhookCredential,
  type TriggerAutomationDeps,
} from "./trigger-automation.js";

const baseDeps = (): TriggerAutomationDeps => ({
  clientId: "personal-jacky",
  credentialsDb: {} as TriggerAutomationDeps["credentialsDb"],
  secretsKey: "test-secrets-key",
  memoryDb: {} as TriggerAutomationDeps["memoryDb"],
  memoryEnv: {} as TriggerAutomationDeps["memoryEnv"],
});

const BARE_URL_SECRET = "https://example.test/webhook?must-not-leak=secret";
const JSON_SECRET = JSON.stringify({
  url: "https://api2.cursor.sh/automations/webhook/must-not-leak-id",
  key: "must-not-leak-bearer-key",
});

describe("trigger_automation tool", () => {
  describe("credentialNameForLane", () => {
    it("maps maker and checker to cursor webhook credential names", () => {
      expect(credentialNameForLane("maker")).toBe("cursor_webhook_orbita_maker");
      expect(credentialNameForLane("checker")).toBe(
        "cursor_webhook_orbita_checker",
      );
    });
  });

  describe("parseWebhookCredential", () => {
    it("parses a {url,key} JSON secret into url + key", () => {
      expect(
        parseWebhookCredential(
          JSON.stringify({ url: "https://example.test/hook", key: "abc123" }),
        ),
      ).toEqual({ url: "https://example.test/hook", key: "abc123" });
    });

    it("treats a bare non-JSON string as a URL with no key", () => {
      expect(parseWebhookCredential("https://example.test/hook")).toEqual({
        url: "https://example.test/hook",
      });
    });

    it("treats {url} JSON with no key field as a URL with no key", () => {
      expect(
        parseWebhookCredential(JSON.stringify({ url: "https://example.test/hook" })),
      ).toEqual({ url: "https://example.test/hook" });
    });

    it("falls back to treating malformed JSON as a bare URL", () => {
      expect(parseWebhookCredential("{not valid json")).toEqual({
        url: "{not valid json",
      });
    });

    it("falls back to a bare URL when JSON has no url field", () => {
      expect(parseWebhookCredential(JSON.stringify({ key: "abc" }))).toEqual({
        url: JSON.stringify({ key: "abc" }),
      });
    });
  });

  describe("executeTriggerAutomation", () => {
    it("rejects empty reason before credential lookup", async () => {
      const resolveCredential = vi.fn();
      const writeNote = vi.fn();
      const webhookFetch = vi.fn();

      const result = await executeTriggerAutomation(
        {
          ...baseDeps(),
          resolveCredential,
          writeNote,
          webhookFetch,
        },
        { lane: "maker", reason: "" },
      );

      expect(result).toMatchObject({
        ok: false,
        kind: "invalid_input",
        message: "reason must be a non-empty string",
      });
      expect(resolveCredential).not.toHaveBeenCalled();
      expect(writeNote).not.toHaveBeenCalled();
      expect(webhookFetch).not.toHaveBeenCalled();
    });

    it("rejects whitespace-only reason before credential lookup", async () => {
      const resolveCredential = vi.fn();

      const result = await executeTriggerAutomation(
        {
          ...baseDeps(),
          resolveCredential,
        },
        { lane: "checker", reason: "   " },
      );

      expect(result).toMatchObject({
        ok: false,
        kind: "invalid_input",
      });
      expect(resolveCredential).not.toHaveBeenCalled();
    });

    it("returns credential_missing without writing a note when secret is absent", async () => {
      const writeNote = vi.fn();
      const webhookFetch = vi.fn();

      const result = await executeTriggerAutomation(
        {
          ...baseDeps(),
          resolveCredential: async () => {
            throw new OrbitaError(
              "not_found",
              "Credential not found: cursor_webhook_orbita_maker",
              404,
            );
          },
          writeNote,
          webhookFetch,
        },
        { lane: "maker", reason: "verify deploy" },
      );

      expect(result).toMatchObject({
        ok: false,
        kind: "credential_missing",
        credential_name: "cursor_webhook_orbita_maker",
      });
      expect(writeNote).not.toHaveBeenCalled();
      expect(webhookFetch).not.toHaveBeenCalled();
    });

    it("posts with a Bearer Authorization header when the credential is {url,key} JSON", async () => {
      const webhookFetch = vi.fn(async () => new Response(null, { status: 200 }));
      let capturedFrontmatter: Record<string, unknown> | undefined;
      const writeNote = vi.fn(async (_db, _clientId, input) => {
        capturedFrontmatter = input.frontmatter;
        return { id: "note-json" };
      });

      const result = await executeTriggerAutomation(
        {
          ...baseDeps(),
          resolveCredential: async () => JSON_SECRET,
          webhookFetch,
          writeNote,
        },
        { lane: "maker", reason: "verify deploy" },
      );

      expect(result).toMatchObject({
        ok: true,
        outcome: "sent",
        note_id: "note-json",
        credential_name: "cursor_webhook_orbita_maker",
      });
      expect(webhookFetch).toHaveBeenCalledTimes(1);
      expect(webhookFetch).toHaveBeenCalledWith(
        "https://api2.cursor.sh/automations/webhook/must-not-leak-id",
        {
          method: "POST",
          headers: { Authorization: "Bearer must-not-leak-bearer-key" },
        },
      );
      expect(capturedFrontmatter).toMatchObject({
        type: "instruction",
        project: "orbita",
        lane: "maker",
        reason: "verify deploy",
        outcome: "sent",
      });
    });

    it("posts with no Authorization header when the credential is a bare URL", async () => {
      const webhookFetch = vi.fn(async () => new Response(null, { status: 200 }));
      const writeNote = vi.fn(async () => ({ id: "note-bare" }));

      const result = await executeTriggerAutomation(
        {
          ...baseDeps(),
          resolveCredential: async () => BARE_URL_SECRET,
          webhookFetch,
          writeNote,
        },
        { lane: "maker", reason: "verify deploy" },
      );

      expect(result).toMatchObject({ ok: true, outcome: "sent" });
      expect(webhookFetch).toHaveBeenCalledTimes(1);
      expect(webhookFetch).toHaveBeenCalledWith(BARE_URL_SECRET, {
        method: "POST",
        headers: {},
      });
    });

    it("writes a failed audit note and reports failure on non-2xx webhook", async () => {
      const webhookFetch = vi.fn(
        async () => new Response("nope", { status: 500 }),
      );
      let capturedFrontmatter: Record<string, unknown> | undefined;
      const writeNote = vi.fn(async (_db, _clientId, input) => {
        capturedFrontmatter = input.frontmatter;
        return { id: "note-2" };
      });

      const result = await executeTriggerAutomation(
        {
          ...baseDeps(),
          resolveCredential: async () => "https://example.test/hook",
          webhookFetch,
          writeNote,
        },
        { lane: "checker", reason: "review queue" },
      );

      expect(result).toMatchObject({
        ok: false,
        kind: "webhook_failed",
        outcome: "failed",
        note_id: "note-2",
        credential_name: "cursor_webhook_orbita_checker",
      });
      expect(capturedFrontmatter).toMatchObject({
        type: "instruction",
        project: "orbita",
        lane: "checker",
        outcome: "failed",
      });
      expect(result.ok === false && result.message).toBeTruthy();
    });

    it("writes a failed audit note and reports failure on network error", async () => {
      const webhookFetch = vi.fn(async () => {
        throw new Error("connection reset");
      });
      let capturedFrontmatter: Record<string, unknown> | undefined;
      const writeNote = vi.fn(async (_db, _clientId, input) => {
        capturedFrontmatter = input.frontmatter;
        return { id: "note-2b" };
      });

      const result = await executeTriggerAutomation(
        {
          ...baseDeps(),
          resolveCredential: async () => "https://example.test/hook",
          webhookFetch,
          writeNote,
        },
        { lane: "maker", reason: "retry after outage" },
      );

      expect(result).toMatchObject({
        ok: false,
        kind: "webhook_failed",
        outcome: "failed",
        note_id: "note-2b",
        message: "connection reset",
      });
      expect(capturedFrontmatter).toMatchObject({ outcome: "failed" });
    });

    it("never surfaces the resolved secret (URL, key, or raw JSON) in result or audit note payloads", async () => {
      const webhookFetch = vi.fn(async () => new Response(null, { status: 200 }));
      let capturedFrontmatter: Record<string, unknown> | undefined;
      let capturedBody: string | undefined;
      const writeNote = vi.fn(async (_db, _clientId, input) => {
        capturedFrontmatter = input.frontmatter;
        capturedBody = input.body;
        return { id: "note-3" };
      });

      const result = await executeTriggerAutomation(
        {
          ...baseDeps(),
          resolveCredential: async () => JSON_SECRET,
          webhookFetch,
          writeNote,
        },
        { lane: "maker", reason: "smoke" },
      );

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("must-not-leak");
      expect(JSON.stringify(capturedFrontmatter)).not.toContain("must-not-leak");
      expect(capturedBody).not.toContain("must-not-leak");
    });
  });
});
