import { OpenAPIHono } from "@hono/zod-openapi";
import { createMiddleware } from "hono/factory";
import { createErrorHandler, createLogger, requestIdMiddleware } from "@orbita/platform";
import { describe, expect, it } from "vitest";
import { FakeTicketRepository } from "../fake-repository.js";
import type { MandateCharter } from "../types.js";
import { createTicketRoutes, listTicketOpenApiPaths } from "./tickets.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const protectedBaseline = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../test-fixtures/protected-openapi-paths-baseline.json"),
    "utf8",
  ),
) as { paths: string[] };

function charter(
  hard_limits: MandateCharter["hard_limits"] = [],
): MandateCharter {
  return {
    purpose: "test",
    principles: ["p"],
    guardrails: {
      allowed_action_categories: ["L0"],
      forbidden_action_categories: [],
      max_auto_risk_tier: "L1",
    },
    cadence: { description: "daily" },
    reporting: { expectations: "none" },
    success_measures: ["ok"],
    review_date: "2026-12-31",
    assigned_principals: ["founder"],
    hard_limits,
    soft_constraints: [],
  };
}

function mockApiKey(id: string) {
  return {
    id,
    keyPrefix: "test",
    keyHash: "hash",
    allowedClientIds: ["tenant-a"],
    scopes: [],
    rateLimitPerMinute: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date(),
  };
}

async function activeMandate(repo: FakeTicketRepository) {
  const mandate = await repo.create({
    client_id: "tenant-a",
    actor: { type: "human" },
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
    actor: { type: "human" },
  });
  return mandate.value.ticket;
}

function testTicketsApp(
  repo: FakeTicketRepository,
  approverKeyIds: Set<string>,
  apiKeyId: string,
) {
  const root = new OpenAPIHono();
  root.onError(createErrorHandler(createLogger("test")));
  root.use("*", requestIdMiddleware);
  root.use(
    "*",
    createMiddleware(async (c, next) => {
      c.set("auth", {
        apiKey: mockApiKey(apiKeyId),
        clientId: "tenant-a",
      });
      await next();
    }),
  );
  root.route("/", createTicketRoutes({ repository: repo, approverKeyIds }));
  return root;
}

describe("ticket REST routes", () => {
  it("openapi paths are disjoint from protected baseline (flag-off snapshot)", () => {
    const repo = new FakeTicketRepository();
    const app = testTicketsApp(repo, new Set(), "key-1");
    const ticketPaths = listTicketOpenApiPaths(app);
    for (const p of ticketPaths) {
      expect(protectedBaseline.paths).not.toContain(p);
    }
  });

  it("denies ticket_approve when approver allowlist is empty", async () => {
    const repo = new FakeTicketRepository();
    const mandate = await activeMandate(repo);
    const epic = await repo.create({
      client_id: "tenant-a",
      actor: { type: "agent", mandate_ids: [mandate.id] },
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

    const app = testTicketsApp(repo, new Set(), "key-1");
    const res = await app.request("/tickets/ticket_approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ticket_id: epic.value.ticket.id,
        actor: { type: "human" },
      }),
    });
    expect(res.status).toBe(403);
  });

  it("allows ticket_approve when api key id is allowlisted", async () => {
    const repo = new FakeTicketRepository();
    const mandate = await activeMandate(repo);
    const epic = await repo.create({
      client_id: "tenant-a",
      actor: { type: "agent", mandate_ids: [mandate.id] },
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

    const app = testTicketsApp(repo, new Set(["key-approver"]), "key-approver");
    const res = await app.request("/tickets/ticket_approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ticket_id: epic.value.ticket.id,
        actor: { type: "human" },
      }),
    });
    expect(res.status).toBe(200);
  });

  it("denies oauth placeholder approver unless listed", async () => {
    const repo = new FakeTicketRepository();
    const app = testTicketsApp(repo, new Set(["key-approver"]), "oauth");
    const mandate = await activeMandate(repo);
    const epic = await repo.create({
      client_id: "tenant-a",
      actor: { type: "agent", mandate_ids: [mandate.id] },
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

    const res = await app.request("/tickets/ticket_approve", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-orbita-agent": "fake-agent",
      },
      body: JSON.stringify({
        ticket_id: epic.value.ticket.id,
        actor: { type: "human", api_key_id: "key-approver" },
      }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 409 when max_open_tasks exceeded via REST create", async () => {
    const repo = new FakeTicketRepository();
    const mandateRow = await repo.create({
      client_id: "tenant-a",
      actor: { type: "human" },
      ticket: {
        project: "p",
        function: "dev",
        kind: "mandate",
        title: "M",
        charter: charter([
          {
            id: "cap_tasks",
            description: "cap",
            enforcement: "server",
            max_open_tasks: 0,
          },
        ]),
      },
    });
    if (!mandateRow.ok) {
      throw new Error(`mandate: ${mandateRow.error.code}`);
    }
    await repo.transition({
      client_id: "tenant-a",
      ticket_id: mandateRow.value.ticket.id,
      verb: "ticket_approve",
      actor: { type: "human" },
    });
    const epic = await repo.create({
      client_id: "tenant-a",
      actor: { type: "human" },
      ticket: {
        project: "p",
        function: "dev",
        kind: "epic",
        parent_id: mandateRow.value.ticket.id,
        title: "E",
        risk_tier: "L0",
      },
    });
    if (!epic.ok) {
      throw new Error("epic");
    }
    await repo.transition({
      client_id: "tenant-a",
      ticket_id: epic.value.ticket.id,
      verb: "ticket_approve",
      actor: { type: "human" },
    });

    const app = testTicketsApp(repo, new Set(["key-approver"]), "key-approver");
    const res = await app.request("/tickets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actor: { type: "human" },
        ticket: {
          project: "p",
          function: "dev",
          kind: "task",
          parent_id: epic.value.ticket.id,
          title: "T",
          risk_tier: "L0",
        },
      }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { details?: { ticket_error?: string } } };
    expect(body.error.details?.ticket_error).toBe("HARD_LIMIT_EXCEEDED");
  });

  it("returns 429 when max_writes_per_day exceeded via REST transition", async () => {
    const repo = new FakeTicketRepository();
    const mandateRow = await repo.create({
      client_id: "tenant-a",
      actor: { type: "human" },
      ticket: {
        project: "p",
        function: "dev",
        kind: "mandate",
        title: "M",
        charter: charter([
          {
            id: "cap_writes",
            description: "writes",
            enforcement: "server",
            max_writes_per_day: 0,
          },
        ]),
      },
    });
    if (!mandateRow.ok) {
      throw new Error(`mandate: ${mandateRow.error.code}`);
    }

    const app = testTicketsApp(repo, new Set(["key-approver"]), "key-approver");
    const res = await app.request("/tickets/ticket_approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ticket_id: mandateRow.value.ticket.id,
        actor: { type: "human" },
      }),
    });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("quota_exceeded");
  });
});
