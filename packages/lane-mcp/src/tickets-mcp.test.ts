import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import {
  FakeTicketRepository,
  type MandateCharter,
} from "@orbita/tickets";
import { initializeMcp, listMcpTools, minimalMcpDeps } from "./mcp-test-helpers.js";

function charter(): MandateCharter {
  return {
    purpose: "test",
    principles: ["p"],
    guardrails: {
      allowed_action_categories: ["dev", "L0"],
      forbidden_action_categories: [],
      max_auto_risk_tier: "L1",
    },
    cadence: { description: "daily" },
    reporting: { expectations: "none" },
    success_measures: ["ok"],
    review_date: "2026-12-31",
    assigned_principals: ["founder"],
    hard_limits: [],
    soft_constraints: [],
  };
}

async function activeMandate(repo: FakeTicketRepository) {
  const mandate = await repo.create({
    client_id: "tenant-a",
    actor: { role: "founder" },
    ticket: {
      project: "p",
      function: "dev",
      kind: "mandate",
      title: "M",
      charter: charter(),
    },
  });
  if (!mandate.ok) {
    throw new Error(`mandate: ${mandate.error.code}`);
  }
  await repo.transition({
    client_id: "tenant-a",
    ticket_id: mandate.value.ticket.id,
    verb: "ticket_approve",
    actor: { role: "founder" },
  });
  return mandate.value.ticket;
}

describe("ticket_* MCP tools", () => {
  it("registers ticket tools only when ticketsEnabled", async () => {
    const off = await listMcpTools(minimalMcpDeps());
    expect(off.some((t) => t.name.startsWith("ticket_"))).toBe(false);

    const repo = new FakeTicketRepository();
    const on = await listMcpTools(
      minimalMcpDeps({
        ticketsEnabled: true,
        tickets: {
          repository: repo,
          actorConfig: {
            founderKeyIds: new Set(["key-approver"]),
            integratorKeyIds: new Set(),
            keyMandates: new Map(),
          },
        },
        apiKeyId: "key-approver",
      }),
    );
    expect(on.filter((t) => t.name.startsWith("ticket_")).length).toBeGreaterThan(
      10,
    );
  });

  it("denies ticket_approve for oauth placeholder when not allowlisted", async () => {
    const repo = new FakeTicketRepository();
    const mandate = await activeMandate(repo);
    const epic = await repo.create({
      client_id: "tenant-a",
      actor: { role: "executor", mandate_ids: [mandate.id] },
      ticket: {
        project: "p",
        function: "dev",
        kind: "epic",
        parent_id: mandate.id,
        title: "E",
        risk_tier: "L0",
      },
    });
    if (!epic.ok) {
      throw new Error(`epic: ${epic.error.code}`);
    }

    const session = await initializeMcp(
      minimalMcpDeps({
        apiKeyId: "oauth",
        ticketsEnabled: true,
        tickets: {
          repository: repo,
          actorConfig: {
            founderKeyIds: new Set(["key-approver"]),
            integratorKeyIds: new Set(),
            keyMandates: new Map(),
          },
        },
      }),
    );

    const result = (await session.callTool("ticket_approve", {
      ticket_id: epic.value.ticket.id,
      actor: { role: "founder", api_key_id: "key-approver" },
    })) as CallToolResult;
    await session.close();

    expect(result.isError).toBe(true);
    const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("forbidden");
  });

  it("ignores actor in tool arguments for ticket_create", async () => {
    const repo = new FakeTicketRepository();
    const session = await initializeMcp(
      minimalMcpDeps({
        apiKeyId: "key-approver",
        ticketsEnabled: true,
        tickets: {
          repository: repo,
          actorConfig: {
            founderKeyIds: new Set(["key-approver"]),
            integratorKeyIds: new Set(),
            keyMandates: new Map(),
          },
        },
      }),
    );

    const result = (await session.callTool("ticket_create", {
      ticket: {
        project: "p",
        function: "dev",
        kind: "mandate",
        title: "M",
        charter: charter(),
      },
      actor: { role: "executor" },
    })) as CallToolResult;
    await session.close();

    expect(result.isError).toBeFalsy();
    const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
    const body = JSON.parse(text) as { ticket: { status: string } };
    expect(body.ticket.status).toBe("draft");
  });

  it("extends orbita_whoami when tickets enabled", async () => {
    const repo = new FakeTicketRepository();
    const mandate = await activeMandate(repo);
    const session = await initializeMcp(
      minimalMcpDeps({
        apiKeyId: "exec-key",
        ticketsEnabled: true,
        tickets: {
          repository: repo,
          actorConfig: {
            founderKeyIds: new Set(),
            integratorKeyIds: new Set(),
            keyMandates: new Map([["exec-key", [mandate.id]]]),
          },
        },
      }),
    );

    const result = (await session.callTool("orbita_whoami", {})) as CallToolResult;
    await session.close();

    const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
    const body = JSON.parse(text) as {
      ticket_role: string;
      mandates: Array<{ mandate_id: string }>;
      ticket_propose_hint: string;
    };
    expect(body.ticket_role).toBe("executor");
    expect(body.mandates[0]?.mandate_id).toBe(mandate.id);
    expect(body.ticket_propose_hint).toContain("ticket_propose");
  });
});
