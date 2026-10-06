import { describe, expect, it } from "vitest";
import { deriveTicketActor } from "./derive-actor.js";

describe("deriveTicketActor", () => {
  it("treats allowlisted keys as human", () => {
    const actor = deriveTicketActor(
      { apiKey: { id: "key-approver" } },
      {
        approverKeyIds: new Set(["key-approver"]),
        keyMandates: new Map(),
      },
    );
    expect(actor).toEqual({
      type: "human",
      principal_id: "key:key-approver",
      api_key_id: "key-approver",
    });
  });

  it("treats non-allowlisted keys as agent with mandate bindings", () => {
    const mandateId = "11111111-1111-4111-8111-111111111111";
    const actor = deriveTicketActor(
      { apiKey: { id: "agent-key" } },
      {
        approverKeyIds: new Set(["key-approver"]),
        keyMandates: new Map([["agent-key", [mandateId]]]),
      },
    );
    expect(actor.type).toBe("agent");
    expect(actor.mandate_ids).toEqual([mandateId]);
  });

  it("gives agents empty mandate_ids when unbound", () => {
    const actor = deriveTicketActor(
      { apiKey: { id: "agent-key" } },
      { approverKeyIds: new Set(), keyMandates: new Map() },
    );
    expect(actor.type).toBe("agent");
    expect(actor.mandate_ids).toEqual([]);
  });

  it("oauth placeholder is human only when explicitly allowlisted", () => {
    const human = deriveTicketActor(
      { apiKey: { id: "oauth" } },
      { approverKeyIds: new Set(["oauth"]), keyMandates: new Map() },
    );
    expect(human.type).toBe("human");

    const agent = deriveTicketActor(
      { apiKey: { id: "oauth" } },
      { approverKeyIds: new Set(["other"]), keyMandates: new Map() },
    );
    expect(agent.type).toBe("agent");
  });
});
