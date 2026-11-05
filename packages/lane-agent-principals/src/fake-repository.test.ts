import { describe, expect, it } from "vitest";
import { FakeAgentPrincipalRepository } from "./fake-repository.js";

const CLIENT_A = "tenant-a";
const CLIENT_B = "tenant-b";

describe("FakeAgentPrincipalRepository tenant isolation", () => {
  it("client A cannot read client B principal", async () => {
    const repo = new FakeAgentPrincipalRepository();
    const created = await repo.createPrincipal({
      client_id: CLIENT_A,
      kind: "human",
      name: "a",
      bound_api_key_id: "key-a",
      scopes: ["sessions:use"],
      mandate_ids: [],
    });
    const foreign = await repo.getPrincipal(CLIENT_B, created.id);
    expect(foreign).toBeNull();
  });

  it("appendAudit is scoped by client_id on list", async () => {
    const repo = new FakeAgentPrincipalRepository();
    const p = await repo.createPrincipal({
      client_id: CLIENT_A,
      kind: "external-agent",
      name: "bot",
      bound_api_key_id: "key-bot",
      scopes: ["tickets:read"],
      mandate_ids: [],
      id: "a1111111-1111-4111-8111-111111111111",
    });
    await repo.appendAudit({
      client_id: CLIENT_A,
      principal_id: p.id,
      surface: "mcp",
      operation: "ticket_claim",
      decision: "allow",
      reason_code: "SCOPE_OK",
    });
    await repo.appendAudit({
      client_id: CLIENT_B,
      principal_id: p.id,
      surface: "mcp",
      operation: "ticket_claim",
      decision: "deny",
      reason_code: "SCOPE_DENIED",
    });
    const aEvents = await repo.listAudit({ client_id: CLIENT_A });
    expect(aEvents).toHaveLength(1);
    expect(aEvents[0]?.decision).toBe("allow");
  });
});
