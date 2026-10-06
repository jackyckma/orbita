import { describe, expect, it } from "vitest";
import { deriveTicketActor } from "./derive-actor.js";

describe("deriveTicketActor", () => {
  it("treats founder keys as founder role", () => {
    const actor = deriveTicketActor(
      { apiKey: { id: "key-founder" } },
      {
        founderKeyIds: new Set(["key-founder"]),
        integratorKeyIds: new Set(),
        keyMandates: new Map(),
      },
    );
    expect(actor).toEqual({
      role: "founder",
      principal_id: "key:key-founder",
      api_key_id: "key-founder",
    });
  });

  it("treats integrator keys as integrator role", () => {
    const actor = deriveTicketActor(
      { apiKey: { id: "key-integrator" } },
      {
        founderKeyIds: new Set(),
        integratorKeyIds: new Set(["key-integrator"]),
        keyMandates: new Map(),
      },
    );
    expect(actor.role).toBe("integrator");
  });

  it("treats other keys as executor with mandate bindings", () => {
    const mandateId = "11111111-1111-4111-8111-111111111111";
    const actor = deriveTicketActor(
      { apiKey: { id: "executor-key" } },
      {
        founderKeyIds: new Set(["key-founder"]),
        integratorKeyIds: new Set(),
        keyMandates: new Map([["executor-key", [mandateId]]]),
      },
    );
    expect(actor.role).toBe("executor");
    expect(actor.mandate_ids).toEqual([mandateId]);
  });

  it("gives executors empty mandate_ids when unbound", () => {
    const actor = deriveTicketActor(
      { apiKey: { id: "executor-key" } },
      { founderKeyIds: new Set(), integratorKeyIds: new Set(), keyMandates: new Map() },
    );
    expect(actor.role).toBe("executor");
    expect(actor.mandate_ids).toEqual([]);
  });

  it("oauth placeholder is founder only when explicitly listed", () => {
    const founder = deriveTicketActor(
      { apiKey: { id: "oauth" } },
      { founderKeyIds: new Set(["oauth"]), integratorKeyIds: new Set(), keyMandates: new Map() },
    );
    expect(founder.role).toBe("founder");

    const executor = deriveTicketActor(
      { apiKey: { id: "oauth" } },
      { founderKeyIds: new Set(["other"]), integratorKeyIds: new Set(), keyMandates: new Map() },
    );
    expect(executor.role).toBe("executor");
  });

  it("falls back to deprecated approverKeyIds for founder", () => {
    const actor = deriveTicketActor(
      { apiKey: { id: "legacy-approver" } },
      {
        founderKeyIds: new Set(),
        approverKeyIds: new Set(["legacy-approver"]),
        integratorKeyIds: new Set(),
        keyMandates: new Map(),
      },
    );
    expect(actor.role).toBe("founder");
  });
});
