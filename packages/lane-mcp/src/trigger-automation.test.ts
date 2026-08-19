import { describe, expect, it, vi } from "vitest";
import { OrbitaError } from "@orbita/platform";
import {
  credentialNameForLane,
  executeTriggerAutomation,
  type TriggerAutomationDeps,
} from "./trigger-automation.js";

const baseDeps = (): TriggerAutomationDeps => ({
  clientId: "personal-jacky",
  credentialsDb: {} as TriggerAutomationDeps["credentialsDb"],
  secretsKey: "test-secrets-key",
  memoryDb: {} as TriggerAutomationDeps["memoryDb"],
  memoryEnv: {} as TriggerAutomationDeps["memoryEnv"],
});

const SECRET_URL = "https://example.test/webhook?key=must-not-leak-secret";

describe("trigger_automation tool", () => {
  describe("credentialNameForLane", () => {
    it("maps maker and checker to cursor webhook credential names", () => {
      expect(credentialNameForLane("maker")).toBe("cursor_webhook_orbita_maker");
      expect(credentialNameForLane("checker")).toBe(
        "cursor_webhook_orbita_checker",
      );
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

    it("posts once and writes a sent audit note on webhook success", async () => {
      const webhookFetch = vi.fn(async () => new Response(null, { status: 200 }));
      let capturedFrontmatter: Record<string, unknown> | undefined;
      let capturedBody: string | undefined;
      const writeNote = vi.fn(async (_db, _clientId, input) => {
        capturedFrontmatter = input.frontmatter;
        capturedBody = input.body;
        return { id: "note-1" };
      });

      const result = await executeTriggerAutomation(
        {
          ...baseDeps(),
          resolveCredential: async () => SECRET_URL,
          webhookFetch,
          writeNote,
        },
        { lane: "maker", reason: "verify deploy" },
      );

      expect(result).toMatchObject({
        ok: true,
        outcome: "sent",
        note_id: "note-1",
        credential_name: "cursor_webhook_orbita_maker",
      });
      expect(webhookFetch).toHaveBeenCalledTimes(1);
      expect(webhookFetch).toHaveBeenCalledWith(SECRET_URL, { method: "POST" });
      expect(writeNote).toHaveBeenCalledTimes(1);
      expect(capturedFrontmatter).toMatchObject({
        type: "instruction",
        project: "orbita",
        lane: "maker",
        reason: "verify deploy",
        outcome: "sent",
      });
      expect(capturedBody).not.toContain("must-not-leak-secret");
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

    it("never surfaces the resolved secret in result or audit note payloads", async () => {
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
          resolveCredential: async () => SECRET_URL,
          webhookFetch,
          writeNote,
        },
        { lane: "maker", reason: "smoke" },
      );

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("must-not-leak-secret");
      expect(serialized).not.toContain(SECRET_URL);
      expect(JSON.stringify(capturedFrontmatter)).not.toContain(
        "must-not-leak-secret",
      );
      expect(capturedBody).not.toContain("must-not-leak-secret");
      expect(capturedBody).not.toContain(SECRET_URL);
    });
  });
});
