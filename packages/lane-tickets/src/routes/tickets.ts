/** REST handlers mounted at `/v1/tickets` on the protected caller app. */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getAuth } from "@orbita/auth";
import { ApiErrorBodySchema } from "@orbita/platform";
import type { TicketRepository, TransitionParams } from "../repository/index.js";
import type { TicketStatus, TicketVerb } from "../types.js";
import {
  deriveTicketActor,
  type TicketActorConfig,
} from "../derive-actor.js";
import {
  isPrivilegedKeyAllowed,
  requiresApproverGate,
} from "./approver.js";
import { approverForbidden, repositoryToOrbitaError } from "./http-errors.js";

const TicketSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string(),
  project: z.string(),
  function: z.enum([
    "dev",
    "infra",
    "support",
    "marketing",
    "sales",
    "ops",
    "research",
  ]),
  kind: z.enum(["mandate", "epic", "task", "decision"]),
  parent_id: z.string().uuid().nullable(),
  title: z.string(),
  status: z.string(),
  version: z.number(),
  source: z.enum(["native", "git"]),
  lease_holder: z.string().nullable(),
  lease_expires_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const TransitionResponseSchema = z.object({
  ticket: TicketSchema,
  event: z
    .object({
      id: z.string().uuid(),
      ticket_id: z.string().uuid(),
      seq: z.number(),
      verb: z.string(),
      at: z.string(),
    })
    .optional(),
  replayed: z.boolean().optional(),
  precheck: z
    .object({
      ok: z.boolean(),
      violations: z.array(
        z.object({
          code: z.string(),
          message: z.string(),
        }),
      ),
    })
    .optional(),
});

export const TICKET_OPENAPI_PATHS = [
  "/tickets",
  "/tickets/{ticket_id}",
  "/tickets/ticket_approve",
  "/tickets/ticket_claim",
  "/tickets/ticket_extend",
  "/tickets/ticket_progress",
  "/tickets/ticket_complete",
  "/tickets/ticket_block",
  "/tickets/ticket_request_decision",
  "/tickets/ticket_comment",
  "/tickets/ticket_cancel",
  "/tickets/ticket_update_charter",
] as const;

export type TicketRoutesDeps = {
  repository: TicketRepository;
  actorConfig: TicketActorConfig;
};

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
];

export function createTicketRoutes(deps: TicketRoutesDeps): OpenAPIHono {
  const app = new OpenAPIHono();
  const { repository, actorConfig } = deps;
  const founderKeyIds =
    actorConfig.founderKeyIds ??
    actorConfig.approverKeyIds ??
    new Set<string>();
  const integratorKeyIds =
    actorConfig.integratorKeyIds ?? new Set<string>();
  const keyMandates = actorConfig.keyMandates ?? new Map();
  const normalizedActorConfig = {
    founderKeyIds,
    integratorKeyIds,
    approverKeyIds: actorConfig.approverKeyIds,
    keyMandates,
  };

  const createRouteDef = createRoute({
    method: "post",
    path: "/tickets",
    tags: ["Tickets"],
    summary: "ticket_create",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              ticket: z.object({
                project: z.string().min(1),
                function: z.enum([
                  "dev",
                  "infra",
                  "support",
                  "marketing",
                  "sales",
                  "ops",
                  "research",
                ]),
                kind: z.enum(["mandate", "epic", "task", "decision"]),
                parent_id: z.string().uuid().nullable().optional(),
                title: z.string().min(1),
                description: z.string().optional(),
                owner: z.string().min(1).optional(),
                requester: z.string().optional(),
                priority: z.number().int().min(0).max(4).optional(),
                risk_tier: z.enum(["L0", "L1", "L2", "money"]).optional(),
                charter: z.record(z.unknown()).optional(),
                acceptance_criteria: z.array(z.string().min(1)).optional(),
                data: z.record(z.unknown()).optional(),
              }),
              idempotency_key: z.string().min(1).max(128).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Created ticket",
        content: {
          "application/json": {
            schema: z.object({ ticket: TicketSchema }),
          },
        },
      },
      409: {
        description: "Conflict",
        content: { "application/json": { schema: ApiErrorBodySchema } },
      },
    },
  });

  app.openapi(createRouteDef, async (c) => {
    const auth = getAuth(c);
    const body = c.req.valid("json");
    const actor = deriveTicketActor(auth, normalizedActorConfig);
    const result = await repository.create({
      client_id: auth.clientId,
      ticket: body.ticket as Parameters<
        typeof repository.create
      >[0]["ticket"],
      actor,
      idempotency_key: body.idempotency_key,
    });
    if (!result.ok) {
      throw repositoryToOrbitaError(result.error);
    }
    return c.json({ ticket: result.value.ticket }, 200);
  });

  const listRoute = createRoute({
    method: "get",
    path: "/tickets",
    tags: ["Tickets"],
    summary: "ticket_list",
    request: {
      query: z.object({
        project: z.string().optional(),
        function: z
          .enum([
            "dev",
            "infra",
            "support",
            "marketing",
            "sales",
            "ops",
            "research",
          ])
          .optional(),
        status: z.string().optional(),
        owner: z.string().optional(),
        updated_since: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
        cursor: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: "Ticket list",
        content: {
          "application/json": {
            schema: z.object({
              tickets: z.array(TicketSchema),
              next_cursor: z.string().nullable(),
            }),
          },
        },
      },
    },
  });

  app.openapi(listRoute, async (c) => {
    const auth = getAuth(c);
    const query = c.req.valid("query");
    const result = await repository.list({
      client_id: auth.clientId,
      project: query.project,
      function: query.function,
      owner: query.owner,
      updated_since: query.updated_since,
      limit: query.limit,
      cursor: query.cursor,
      status: query.status as TicketStatus | undefined,
    });
    if (!result.ok) {
      throw repositoryToOrbitaError(result.error);
    }
    return c.json(result.value, 200);
  });

  const getRoute = createRoute({
    method: "get",
    path: "/tickets/{ticket_id}",
    tags: ["Tickets"],
    summary: "ticket_get",
    request: {
      params: z.object({ ticket_id: z.string().uuid() }),
      query: z.object({
        include_events: z
          .enum(["true", "false"])
          .optional()
          .transform((v) => v === "true"),
      }),
    },
    responses: {
      200: {
        description: "Ticket",
        content: {
          "application/json": {
            schema: z.object({
              ticket: TicketSchema,
              events: z.array(z.record(z.unknown())).optional(),
            }),
          },
        },
      },
      404: {
        description: "Not found",
        content: { "application/json": { schema: ApiErrorBodySchema } },
      },
    },
  });

  app.openapi(getRoute, async (c) => {
    const auth = getAuth(c);
    const { ticket_id } = c.req.valid("param");
    const { include_events } = c.req.valid("query");
    const result = await repository.get({
      client_id: auth.clientId,
      ticket_id,
      include_events,
    });
    if (!result.ok) {
      throw repositoryToOrbitaError(result.error);
    }
    return c.json(result.value, 200);
  });

  async function ensureApprover(
    c: { get: (k: "auth") => ReturnType<typeof getAuth> },
    verb: TicketVerb,
    ticket_id: string,
  ): Promise<void> {
    const auth = getAuth(c);
    if (requiresApproverGate(verb, undefined)) {
      if (
        !isPrivilegedKeyAllowed(
          auth.apiKey.id,
          founderKeyIds,
          integratorKeyIds,
        )
      ) {
        throw approverForbidden();
      }
      return;
    }
    if (verb === "ticket_cancel") {
      const loaded = await repository.get({
        client_id: auth.clientId,
        ticket_id,
      });
      const status = loaded.ok ? loaded.value.ticket.status : undefined;
      if (requiresApproverGate(verb, status)) {
        if (
          !isPrivilegedKeyAllowed(
            auth.apiKey.id,
            founderKeyIds,
            integratorKeyIds,
          )
        ) {
          throw approverForbidden();
        }
      }
    }
  }

  for (const verb of TRANSITION_VERBS) {
    const path = `/tickets/${verb}` as `/tickets/${TicketVerb}`;
    const route = createRoute({
      method: "post",
      path,
      tags: ["Tickets"],
      summary: verb,
      request: {
        body: {
          content: {
            "application/json": {
              schema: z
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
                })
                .passthrough(),
            },
          },
        },
      },
      responses: {
        200: {
          description: "Transition result",
          content: {
            "application/json": { schema: TransitionResponseSchema },
          },
        },
        403: {
          description: "Approver denied",
          content: { "application/json": { schema: ApiErrorBodySchema } },
        },
        409: {
          description: "Conflict",
          content: { "application/json": { schema: ApiErrorBodySchema } },
        },
        429: {
          description: "Quota / rate limit",
          content: { "application/json": { schema: ApiErrorBodySchema } },
        },
      },
    });

    app.openapi(route, async (c) => {
      const auth = getAuth(c);
      const body = c.req.valid("json");
      await ensureApprover(c, verb, body.ticket_id);

      const actor = deriveTicketActor(auth, normalizedActorConfig);

      const params: TransitionParams = {
        client_id: auth.clientId,
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
      };

      const result = await repository.transition(params);
      if (!result.ok) {
        throw repositoryToOrbitaError(result.error);
      }
      return c.json(
        {
          ticket: result.value.ticket,
          event: result.value.event,
          replayed: result.value.replayed,
          precheck: result.value.precheck,
        },
        200,
      );
    });
  }

  return app;
}

/** Collect registered OpenAPI paths (for golden / flag-off tests). */
export function listTicketOpenApiPaths(app: OpenAPIHono): string[] {
  const doc = app.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "tickets", version: "0" },
  });
  return Object.keys(doc.paths ?? {}).sort();
}
