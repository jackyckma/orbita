import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  deriveTicketActor,
  isPrivilegedKeyAllowed,
  requiresApproverGate,
  type TicketActorConfig,
  type TicketRepository,
  type TicketStatus,
  type TicketVerb,
  type TransitionParams,
} from "@orbita/tickets";
import { z } from "zod";
import {
  privilegedDeniedMessage,
  repositoryErrorMessage,
} from "./tickets-mcp-errors.js";

/** Optional MCP-only metadata on ticket tool inputs (not forwarded to the repository). */
export const ticketMcpMetadataShape = {
  reported_by: z.string().optional(),
  labels: z.array(z.string()).optional(),
};

const ticketFunctionSchema = z.enum([
  "dev",
  "infra",
  "support",
  "marketing",
  "sales",
  "ops",
  "research",
]);

const riskTierSchema = z.enum(["L0", "L1", "L2", "money"]);

const TRANSITION_VERBS: TicketVerb[] = [
  "ticket_approve",
  "ticket_claim",
  "ticket_extend",
  "ticket_progress",
  "ticket_complete",
  "ticket_block",
  "ticket_request_decision",
  "ticket_comment",
  "ticket_cancel",
  "ticket_update_charter",
  "ticket_review",
  "ticket_resolve",
];

export type TicketMcpDeps = {
  clientId: string;
  apiKeyId: string;
  repository: TicketRepository;
  actorConfig: TicketActorConfig;
};

function textResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

function stripIgnoredToolFields<T extends Record<string, unknown>>(input: T): T {
  const { actor: _a, reported_by: _r, labels: _l, ...rest } = input;
  return rest as T;
}

function normalizedActorConfig(actorConfig: TicketActorConfig) {
  const founderKeyIds =
    actorConfig.founderKeyIds ??
    actorConfig.approverKeyIds ??
    new Set<string>();
  const integratorKeyIds = actorConfig.integratorKeyIds ?? new Set<string>();
  return {
    founderKeyIds,
    integratorKeyIds,
    approverKeyIds: actorConfig.approverKeyIds,
    keyMandates: actorConfig.keyMandates ?? new Map(),
  };
}

async function ensurePrivileged(
  deps: TicketMcpDeps,
  verb: TicketVerb,
  ticket_id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const cfg = normalizedActorConfig(deps.actorConfig);
  if (requiresApproverGate(verb, undefined)) {
    if (
      !isPrivilegedKeyAllowed(
        deps.apiKeyId,
        cfg.founderKeyIds,
        cfg.integratorKeyIds,
      )
    ) {
      return { ok: false, message: privilegedDeniedMessage() };
    }
    return { ok: true };
  }
  if (verb === "ticket_cancel") {
    const loaded = await deps.repository.get({
      client_id: deps.clientId,
      ticket_id,
    });
    const status = loaded.ok ? loaded.value.ticket.status : undefined;
    if (requiresApproverGate(verb, status)) {
      if (
        !isPrivilegedKeyAllowed(
          deps.apiKeyId,
          cfg.founderKeyIds,
          cfg.integratorKeyIds,
        )
      ) {
        return { ok: false, message: privilegedDeniedMessage() };
      }
    }
  }
  return { ok: true };
}

const transitionBodySchema = z
  .object({
    ticket_id: z.string().uuid(),
    expected_version: z.number().int().min(1).optional(),
    idempotency_key: z.string().min(1).max(128).optional(),
    comment: z.string().optional(),
    reason: z.string().optional(),
    note: z.string().optional(),
    status: z.string().optional(),
    next_action: z.string().optional(),
    owner: z.string().min(1).optional(),
    lease_seconds: z.number().int().positive().optional(),
    lease_holder: z.string().min(1).optional(),
    blocked_on: z.string().optional(),
    progress_target: z.string().optional(),
    payload: z.record(z.unknown()).optional(),
    override_precheck: z.boolean().optional(),
    charter_patch: z.record(z.unknown()).optional(),
    review_outcome: z.enum(["accepted", "needs_changes", "cancel"]).optional(),
    outcome: z
      .enum(["accepted", "declined", "needs_info", "deferred"])
      .optional(),
    response: z.string().optional(),
    result_refs: z.record(z.unknown()).optional(),
    actor: z.unknown().optional(),
    ...ticketMcpMetadataShape,
  })
  .passthrough();

function roleHintForVerb(verb: TicketVerb): string {
  if (
    verb === "ticket_approve" ||
    verb === "ticket_cancel" ||
    verb === "ticket_update_charter" ||
    verb === "ticket_review" ||
    verb === "ticket_resolve"
  ) {
    return " Requires founder or integrator role (derived from your API key; never pass actor).";
  }
  return " Actor and role are derived from your API key; never pass actor in tool arguments.";
}

export function registerTicketMcpTools(server: McpServer, deps: TicketMcpDeps) {
  const cfg = normalizedActorConfig(deps.actorConfig);
  const auth = { apiKey: { id: deps.apiKeyId } };

  server.registerTool(
    "ticket_create",
    {
      title: "Create ticket",
      description:
        "Create mandate, epic, task, or decision. Role derived from auth; executors only within bound mandates." +
        roleHintForVerb("ticket_create"),
      inputSchema: z.object({
        ticket: z.object({
          project: z.string().min(1),
          function: ticketFunctionSchema,
          kind: z.enum(["mandate", "epic", "task", "decision"]),
          parent_id: z.string().uuid().nullable().optional(),
          title: z.string().min(1),
          description: z.string().optional(),
          owner: z.string().min(1).optional(),
          requester: z.string().optional(),
          priority: z.number().int().min(0).max(4).optional(),
          risk_tier: riskTierSchema.optional(),
          charter: z.record(z.unknown()).optional(),
          acceptance_criteria: z.array(z.string().min(1)).optional(),
          data: z.record(z.unknown()).optional(),
          task_class: z.enum(["planned", "exception"]).optional(),
          exception_type: z.string().min(1).optional(),
        }),
        idempotency_key: z.string().min(1).max(128).optional(),
        actor: z.unknown().optional(),
        ...ticketMcpMetadataShape,
      }),
    },
    async (raw) => {
      const body = stripIgnoredToolFields(raw);
      const actor = deriveTicketActor(auth, cfg);
      const result = await deps.repository.create({
        client_id: deps.clientId,
        ticket: body.ticket as Parameters<
          typeof deps.repository.create
        >[0]["ticket"],
        actor,
        idempotency_key: body.idempotency_key,
      });
      if (!result.ok) {
        return errorResult(repositoryErrorMessage(result.error));
      }
      return textResult({ ticket: result.value.ticket });
    },
  );

  server.registerTool(
    "ticket_list",
    {
      title: "List tickets",
      description:
        "List tickets for your client. Use filters such as decision_class=proposal for integrator inbox." +
        roleHintForVerb("ticket_list"),
      inputSchema: z.object({
        project: z.string().optional(),
        function: ticketFunctionSchema.optional(),
        status: z.string().optional(),
        owner: z.string().optional(),
        updated_since: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        cursor: z.string().optional(),
        task_class: z.enum(["planned", "exception"]).optional(),
        requires_review: z.boolean().optional(),
        reviewed: z.boolean().optional(),
        decision_class: z.enum(["question", "proposal"]).optional(),
        proposal_type: z
          .enum([
            "process_change",
            "task_type_request",
            "charter_change_request",
            "access_or_tool_request",
            "cross_agent_suggestion",
            "other",
          ])
          .optional(),
        mine: z.boolean().optional(),
        actor: z.unknown().optional(),
        ...ticketMcpMetadataShape,
      }),
    },
    async (raw) => {
      stripIgnoredToolFields(raw);
      const actor = deriveTicketActor(auth, cfg);
      const result = await deps.repository.list({
        client_id: deps.clientId,
        project: raw.project,
        function: raw.function,
        owner: raw.owner,
        updated_since: raw.updated_since,
        limit: raw.limit,
        cursor: raw.cursor,
        status: raw.status as TicketStatus | undefined,
        task_class: raw.task_class,
        requires_review: raw.requires_review,
        reviewed: raw.reviewed,
        decision_class: raw.decision_class,
        proposal_type: raw.proposal_type,
        mine: raw.mine,
        actor,
      });
      if (!result.ok) {
        return errorResult(repositoryErrorMessage(result.error));
      }
      return textResult(result.value);
    },
  );

  server.registerTool(
    "ticket_get",
    {
      title: "Get ticket",
      description:
        "Fetch a ticket by id; use on mandates to read charter before acting." +
        roleHintForVerb("ticket_get"),
      inputSchema: z.object({
        ticket_id: z.string().uuid(),
        include_events: z.boolean().optional(),
        actor: z.unknown().optional(),
        ...ticketMcpMetadataShape,
      }),
    },
    async (raw) => {
      const body = stripIgnoredToolFields(raw);
      const actor = deriveTicketActor(auth, cfg);
      const result = await deps.repository.get({
        client_id: deps.clientId,
        ticket_id: body.ticket_id,
        include_events: body.include_events,
        actor,
      });
      if (!result.ok) {
        return errorResult(repositoryErrorMessage(result.error));
      }
      return textResult(result.value);
    },
  );

  server.registerTool(
    "ticket_propose",
    {
      title: "Propose change",
      description:
        "Submit a proposal decision ticket under an active mandate (executors: own mandate only). Never instruct another bot; integrator resolves via ticket_resolve." +
        roleHintForVerb("ticket_propose"),
      inputSchema: z.object({
        parent_id: z.string().uuid(),
        project: z.string().min(1),
        function: ticketFunctionSchema,
        proposal_type: z.enum([
          "process_change",
          "task_type_request",
          "charter_change_request",
          "access_or_tool_request",
          "cross_agent_suggestion",
          "other",
        ]),
        suggested_change: z.string().min(1),
        rationale: z.string().min(1),
        risk_tier: riskTierSchema.optional(),
        target: z
          .object({
            mandate_id: z.string().uuid().optional(),
            ticket_id: z.string().uuid().optional(),
          })
          .optional(),
        title: z.string().min(1).optional(),
        inputs_from: z
          .array(
            z.object({
              kind: z.enum(["note", "url", "ticket", "chat"]),
              ref: z.string().min(1),
              from: z.string().optional(),
            }),
          )
          .optional(),
        idempotency_key: z.string().min(1).max(128).optional(),
        actor: z.unknown().optional(),
        ...ticketMcpMetadataShape,
      }),
    },
    async (raw) => {
      const body = stripIgnoredToolFields(raw);
      const actor = deriveTicketActor(auth, cfg);
      const result = await deps.repository.propose({
        client_id: deps.clientId,
        actor,
        parent_id: body.parent_id,
        project: body.project,
        function: body.function,
        proposal_type: body.proposal_type,
        suggested_change: body.suggested_change,
        rationale: body.rationale,
        risk_tier: body.risk_tier,
        target: body.target,
        title: body.title,
        inputs_from: body.inputs_from,
        idempotency_key: body.idempotency_key,
      });
      if (!result.ok) {
        return errorResult(repositoryErrorMessage(result.error));
      }
      return textResult({
        ticket: result.value.ticket,
        event: result.value.event,
        replayed: result.value.replayed,
      });
    },
  );

  for (const verb of TRANSITION_VERBS) {
    server.registerTool(
      verb,
      {
        title: verb,
        description: `Ticket transition ${verb}.` + roleHintForVerb(verb),
        inputSchema: transitionBodySchema,
      },
      async (raw) => {
        const body = stripIgnoredToolFields(transitionBodySchema.parse(raw));
        const gate = await ensurePrivileged(deps, verb, body.ticket_id);
        if (!gate.ok) {
          return errorResult(gate.message);
        }
        const actor = deriveTicketActor(auth, cfg);
        const params: TransitionParams = {
          client_id: deps.clientId,
          ticket_id: body.ticket_id,
          verb,
          actor,
          expected_version: body.expected_version,
          idempotency_key: body.idempotency_key,
          comment: body.comment ?? body.note,
          blocked_on: body.blocked_on,
          lease_seconds: body.lease_seconds,
          lease_holder: body.lease_holder,
          progress_target: body.progress_target as TransitionParams["progress_target"],
          payload:
            body.reason !== undefined
              ? { ...(body.payload ?? {}), reason: body.reason }
              : body.payload,
          override_precheck: body.override_precheck,
          charter_patch: body.charter_patch as TransitionParams["charter_patch"],
          review_outcome: body.review_outcome as TransitionParams["review_outcome"],
          proposal_resolve_outcome: body.outcome as TransitionParams["proposal_resolve_outcome"],
          proposal_response: body.response,
          result_refs: body.result_refs as TransitionParams["result_refs"],
        };
        const result = await deps.repository.transition(params);
        if (!result.ok) {
          return errorResult(repositoryErrorMessage(result.error));
        }
        return textResult({
          ticket: result.value.ticket,
          event: result.value.event,
          replayed: result.value.replayed,
          precheck: result.value.precheck,
        });
      },
    );
  }
}
