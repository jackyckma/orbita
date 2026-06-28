import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ApiErrorBodySchema, notFound } from "@orbita/platform";
import { getAuth, requireScope } from "@orbita/auth";
import type { MemoryDb } from "@orbita/memory";
import type { MemoryEnv } from "@orbita/memory";
import type { AgentTurnRunner, SessionSummarizer, SessionsDb } from "@orbita/sessions";
import type { HarnessDb } from "../db/client.js";
import { harnesses } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import {
  appendHarnessFeedback,
  createHarnessRecord,
  getHarnessRecord,
  getHarnessRunRecord,
  listHarnessRecords,
  listHarnessRunRecords,
  patchHarnessRecord,
} from "../service.js";
import { executeHarnessRun } from "../tick.js";
import { listHarnessTemplates, templatePublicId } from "../templates.js";
import { createHarnessBodySchema, type HarnessTemplate } from "../types.js";

export function createHarnessRoutes(deps: {
  harnessDb: HarnessDb;
  sessionsDb: SessionsDb;
  memoryDb: MemoryDb;
  memoryEnv: MemoryEnv;
  runTurn: AgentTurnRunner;
  summarizer?: SessionSummarizer;
}): OpenAPIHono {
  const app = new OpenAPIHono();
  app.use("/harnesses/*", requireScope("sessions:use"));
  app.use("/harness-templates", requireScope("sessions:use"));
  app.use("/harness-runs/*", requireScope("sessions:use"));

  const listTemplatesRoute = createRoute({
    method: "get",
    path: "/harness-templates",
    tags: ["Harness"],
    summary: "List built-in harness templates (H1)",
    responses: {
      200: {
        description: "Template catalog",
        content: {
          "application/json": {
            schema: z.object({
              templates: z.array(
                z.object({
                  id: z.string(),
                  version: z.number(),
                  description: z.string(),
                  extends: z.string().optional(),
                  application: z.record(z.unknown()).optional(),
                }),
              ),
            }),
          },
        },
      },
    },
  });

  app.openapi(listTemplatesRoute, async (c) => {
    const templates = listHarnessTemplates().map((t: HarnessTemplate) => ({
      id: templatePublicId(t),
      version: t.version,
      description: t.description,
      extends: t.extends,
      application: t.application,
    }));
    return c.json({ templates }, 200);
  });

  const createHarnessRoute = createRoute({
    method: "post",
    path: "/harnesses",
    tags: ["Harness"],
    summary: "Create harness from template",
    request: {
      body: {
        content: { "application/json": { schema: createHarnessBodySchema } },
      },
    },
    responses: {
      201: {
        description: "Harness created",
        content: { "application/json": { schema: z.object({ harness: z.record(z.unknown()) }) } },
      },
      400: { description: "Bad request", content: { "application/json": { schema: ApiErrorBodySchema } } },
    },
  });

  app.openapi(createHarnessRoute, async (c) => {
    const auth = getAuth(c);
    const body = c.req.valid("json");
    const harness = await createHarnessRecord(
      deps.harnessDb,
      deps.sessionsDb,
      deps.memoryDb,
      deps.memoryEnv,
      auth.clientId,
      body,
    );
    return c.json({ harness }, 201);
  });

  const listHarnessesRoute = createRoute({
    method: "get",
    path: "/harnesses",
    tags: ["Harness"],
    summary: "List harnesses for client",
    responses: {
      200: {
        description: "Harness list",
        content: {
          "application/json": {
            schema: z.object({ harnesses: z.array(z.record(z.unknown())) }),
          },
        },
      },
    },
  });

  app.openapi(listHarnessesRoute, async (c) => {
    const auth = getAuth(c);
    const items = await listHarnessRecords(deps.harnessDb, auth.clientId);
    return c.json({ harnesses: items }, 200);
  });

  const getHarnessRoute = createRoute({
    method: "get",
    path: "/harnesses/{harness_id}",
    tags: ["Harness"],
    request: { params: z.object({ harness_id: z.string().uuid() }) },
    responses: {
      200: {
        description: "Harness",
        content: { "application/json": { schema: z.object({ harness: z.record(z.unknown()) }) } },
      },
      404: { description: "Not found", content: { "application/json": { schema: ApiErrorBodySchema } } },
    },
  });

  app.openapi(getHarnessRoute, async (c) => {
    const auth = getAuth(c);
    const { harness_id } = c.req.valid("param");
    const harness = await getHarnessRecord(deps.harnessDb, auth.clientId, harness_id);
    return c.json({ harness }, 200);
  });

  const patchHarnessRoute = createRoute({
    method: "patch",
    path: "/harnesses/{harness_id}",
    tags: ["Harness"],
    request: {
      params: z.object({ harness_id: z.string().uuid() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              enabled: z.boolean().optional(),
              cron: z.string().min(1).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Harness updated",
        content: { "application/json": { schema: z.object({ harness: z.record(z.unknown()) }) } },
      },
    },
  });

  app.openapi(patchHarnessRoute, async (c) => {
    const auth = getAuth(c);
    const { harness_id } = c.req.valid("param");
    const body = c.req.valid("json");
    const harness = await patchHarnessRecord(
      deps.harnessDb,
      auth.clientId,
      harness_id,
      body,
    );
    return c.json({ harness }, 200);
  });

  const triggerRoute = createRoute({
    method: "post",
    path: "/harnesses/{harness_id}/trigger",
    tags: ["Harness"],
    summary: "Manual harness run",
    request: { params: z.object({ harness_id: z.string().uuid() }) },
    responses: {
      200: {
        description: "Run started",
        content: {
          "application/json": {
            schema: z.object({
              ok: z.boolean(),
              run_id: z.string().uuid().optional(),
              error: z.string().optional(),
            }),
          },
        },
      },
    },
  });

  app.openapi(triggerRoute, async (c) => {
    const auth = getAuth(c);
    const { harness_id } = c.req.valid("param");
    const [row] = await deps.harnessDb.db
      .select()
      .from(harnesses)
      .where(and(eq(harnesses.id, harness_id), eq(harnesses.clientId, auth.clientId)));
    if (!row) throw notFound("Harness not found");
    const result = await executeHarnessRun(
      deps.harnessDb,
      deps.sessionsDb,
      row!,
      "manual",
      new Date(),
      deps.runTurn,
      deps.summarizer,
    );
    return c.json({ ok: result.ran, run_id: result.runId, error: result.error }, 200);
  });

  const listRunsRoute = createRoute({
    method: "get",
    path: "/harnesses/{harness_id}/runs",
    tags: ["Harness"],
    request: { params: z.object({ harness_id: z.string().uuid() }) },
    responses: {
      200: {
        description: "Run list",
        content: {
          "application/json": {
            schema: z.object({ runs: z.array(z.record(z.unknown())) }),
          },
        },
      },
    },
  });

  app.openapi(listRunsRoute, async (c) => {
    const auth = getAuth(c);
    const { harness_id } = c.req.valid("param");
    const runs = await listHarnessRunRecords(deps.harnessDb, auth.clientId, harness_id);
    return c.json({ runs }, 200);
  });

  const getRunRoute = createRoute({
    method: "get",
    path: "/harness-runs/{run_id}",
    tags: ["Harness"],
    request: { params: z.object({ run_id: z.string().uuid() }) },
    responses: {
      200: {
        description: "Run",
        content: { "application/json": { schema: z.object({ run: z.record(z.unknown()) }) } },
      },
    },
  });

  app.openapi(getRunRoute, async (c) => {
    const auth = getAuth(c);
    const { run_id } = c.req.valid("param");
    const run = await getHarnessRunRecord(deps.harnessDb, auth.clientId, run_id);
    return c.json({ run }, 200);
  });

  const feedbackRoute = createRoute({
    method: "post",
    path: "/harnesses/{harness_id}/feedback",
    tags: ["Harness"],
    summary: "Append structured feedback (Loop 4 sink, H1.5)",
    request: {
      params: z.object({ harness_id: z.string().uuid() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              text: z.string().min(1),
              tags: z.array(z.string()).optional(),
              source: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Feedback appended",
        content: {
          "application/json": {
            schema: z.object({
              ok: z.literal(true),
              key: z.string(),
              entry_count: z.number(),
            }),
          },
        },
      },
    },
  });

  app.openapi(feedbackRoute, async (c) => {
    const auth = getAuth(c);
    const { harness_id } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await appendHarnessFeedback(
      deps.harnessDb,
      deps.memoryDb,
      deps.memoryEnv,
      auth.clientId,
      harness_id,
      body,
    );
    return c.json(result, 200);
  });

  return app;
}
