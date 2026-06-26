import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ApiErrorBodySchema,
  MessageInputSchema,
  badRequest,
  forbidden,
} from "@orbita/platform";
import { listProfileIds } from "@orbita/profiles";
import { getAuth, requireScope } from "@orbita/auth";
import {
  compressSession,
  createSession,
  deleteSession,
  getSessionForClient,
  listMessages,
  messageToJson,
  postMessage,
  sessionToJson,
} from "../services/sessions.js";
import type { QuotaLimits } from "../quota.js";
import {
  assertClientMessageQuota,
  assertClientSessionQuota,
} from "../quota.js";
import type { AgentTurnRunner, SessionSummarizer } from "../services/history.js";
import type { SessionsDb } from "../db/client.js";

export function createSessionRoutes(
  sessionsDb: SessionsDb,
  runTurn?: AgentTurnRunner,
  summarizer?: SessionSummarizer,
  quota: QuotaLimits = { sessionsPerDay: 0, messagesPerDay: 0 },
): OpenAPIHono {
  const app = new OpenAPIHono();

  app.use("/sessions/*", requireScope("sessions:use"));

  const createSessionRoute = createRoute({
    method: "post",
    path: "/sessions",
    tags: ["Sessions"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              agent_profile: z.string().default("default"),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Session created",
        content: {
          "application/json": {
            schema: z.object({
              session: z.record(z.unknown()),
            }),
          },
        },
      },
      400: { description: "Bad request", content: { "application/json": { schema: ApiErrorBodySchema } } },
    },
  });

  app.openapi(createSessionRoute, async (c) => {
    const auth = getAuth(c);
    if (!auth.apiKey.scopes.includes("sessions:create")) {
      throw forbidden("Missing required scope: sessions:create");
    }
    const body = c.req.valid("json");
    const profileIds = listProfileIds();
    if (!profileIds.includes(body.agent_profile)) {
      throw badRequest("Unknown agent_profile", { agent_profile: body.agent_profile });
    }
    await assertClientSessionQuota(sessionsDb, auth.clientId, quota);
    const session = await createSession(sessionsDb, auth.clientId, body.agent_profile);
    return c.json({ session: sessionToJson(session) }, 201);
  });

  const getSessionRoute = createRoute({
    method: "get",
    path: "/sessions/{session_id}",
    tags: ["Sessions"],
    request: { params: z.object({ session_id: z.string().uuid() }) },
    responses: {
      200: {
        description: "Session state",
        content: { "application/json": { schema: z.object({ session: z.record(z.unknown()) }) } },
      },
    },
  });

  app.openapi(getSessionRoute, async (c) => {
    const auth = getAuth(c);
    const { session_id } = c.req.valid("param");
    const session = await getSessionForClient(sessionsDb, session_id, auth.clientId);
    return c.json({ session: sessionToJson(session) }, 200);
  });

  const listMessagesRoute = createRoute({
    method: "get",
    path: "/sessions/{session_id}/messages",
    tags: ["Sessions"],
    request: {
      params: z.object({ session_id: z.string().uuid() }),
      query: z.object({ since: z.coerce.number().int().nonnegative().optional() }),
    },
    responses: {
      200: {
        description: "Message history",
        content: {
          "application/json": {
            schema: z.object({ messages: z.array(z.record(z.unknown())) }),
          },
        },
      },
    },
  });

  app.openapi(listMessagesRoute, async (c) => {
    const auth = getAuth(c);
    const { session_id } = c.req.valid("param");
    const { since } = c.req.valid("query");
    await getSessionForClient(sessionsDb, session_id, auth.clientId);
    const rows = await listMessages(sessionsDb, session_id, since);
    return c.json({ messages: rows.map(messageToJson) }, 200);
  });

  const postMessageRoute = createRoute({
    method: "post",
    path: "/sessions/{session_id}/messages",
    tags: ["Sessions"],
    request: {
      params: z.object({ session_id: z.string().uuid() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              input: MessageInputSchema,
              include_natural_language: z.boolean().default(true),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Message processed",
        content: {
          "application/json": {
            schema: z.object({
              output: z.record(z.unknown()).optional(),
              execution_meta: z.record(z.unknown()).optional(),
            }).passthrough(),
          },
        },
      },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const postMessageHandler: any = async (c: any) => {
    const auth = getAuth(c);
    const { session_id } = c.req.valid("param");
    const body = c.req.valid("json");
    await assertClientMessageQuota(sessionsDb, auth.clientId, quota);
    const result = await postMessage(
      sessionsDb,
      session_id,
      auth.clientId,
      body.input,
      body.include_natural_language,
      runTurn,
      summarizer,
    );
    return c.json(result, 200);
  };
  app.openapi(postMessageRoute, postMessageHandler);

  const compressRoute = createRoute({
    method: "post",
    path: "/sessions/{session_id}/compress",
    tags: ["Sessions"],
    request: { params: z.object({ session_id: z.string().uuid() }) },
    responses: {
      200: {
        description: "Compression result",
        content: {
          "application/json": {
            schema: z.object({
              compressed: z.boolean(),
              token_count_estimate: z.number(),
              cache_break: z.boolean(),
              message: z.string().optional(),
            }),
          },
        },
      },
    },
  });

  app.openapi(compressRoute, async (c) => {
    const auth = getAuth(c);
    const { session_id } = c.req.valid("param");
    const result = await compressSession(
      sessionsDb,
      session_id,
      auth.clientId,
      summarizer,
    );
    return c.json(result, 200);
  });

  const deleteSessionRoute = createRoute({
    method: "delete",
    path: "/sessions/{session_id}",
    tags: ["Sessions"],
    request: { params: z.object({ session_id: z.string().uuid() }) },
    responses: { 204: { description: "Session ended" } },
  });

  app.openapi(deleteSessionRoute, async (c) => {
    const auth = getAuth(c);
    const { session_id } = c.req.valid("param");
    await deleteSession(sessionsDb, session_id, auth.clientId);
    return c.body(null, 204);
  });

  return app;
}
