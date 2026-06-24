import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { MemoryEnv } from "@orbita/memory";
import { getMemoryByKey, upsertMemory, type MemoryDb } from "@orbita/memory";
import { listProfileIds } from "@orbita/profiles";
import { badRequest, forbidden, internalError } from "@orbita/platform";
import type { SessionsDb } from "@orbita/sessions";
import {
  createSession,
  postMessage,
  type AgentTurnRunner,
  type SessionSummarizer,
} from "@orbita/sessions";
import { logTrajectoryEvent, type TrajectoryDb } from "@orbita/trajectory";
import { randomUUID } from "node:crypto";

export type InboundEmailEnv = {
  ORBITA_INBOUND_EMAIL_TOKEN?: string;
  ORBITA_INBOUND_CLIENT_ID?: string;
  ORBITA_INBOUND_AGENT_PROFILE?: string;
  ORBITA_INSTANCE_FROM_EMAIL?: string;
};

function normalizeMailbox(email: string): string {
  return email.trim().toLowerCase();
}

function sessionMemoryKey(from: string): string {
  return `inbox-session/${normalizeMailbox(from)}`;
}

export function createInboundEmailRoutes(
  deps: {
    inboundEnv: InboundEmailEnv;
    sessionsDb: SessionsDb;
    memoryDb: MemoryDb;
    memoryEnv: MemoryEnv;
    trajectoryDb: TrajectoryDb;
    runTurn: AgentTurnRunner;
    summarizer?: SessionSummarizer;
  },
): OpenAPIHono {
  const app = new OpenAPIHono();

  const route = createRoute({
    method: "post",
    path: "/inbound/email",
    tags: ["Inbound"],
    summary: "Process inbound email (Cloudflare Email Worker adapter)",
    request: {
      headers: z.object({
        "x-orbita-inbound-token": z.string().min(1),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              from: z.string().email(),
              to: z.string().email(),
              subject: z.string().max(500).default(""),
              text: z.string().max(50_000),
              message_id: z.string().max(500).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Email queued for agent turn",
        content: {
          "application/json": {
            schema: z.object({
              session_id: z.string().uuid(),
              inbox_key: z.string(),
              processed: z.literal(true),
            }),
          },
        },
      },
    },
  });

  app.openapi(route, async (c) => {
    const token = deps.inboundEnv.ORBITA_INBOUND_EMAIL_TOKEN;
    if (!token) {
      throw internalError("Inbound email is not configured");
    }
    if (c.req.header("x-orbita-inbound-token") !== token) {
      throw forbidden("Invalid inbound token");
    }

    const clientId = deps.inboundEnv.ORBITA_INBOUND_CLIENT_ID?.trim() || "orbita-instance";
    const profileId = deps.inboundEnv.ORBITA_INBOUND_AGENT_PROFILE?.trim() || "marketing";
    if (!listProfileIds().includes(profileId)) {
      throw badRequest("Invalid inbound agent profile", { agent_profile: profileId });
    }

    const body = c.req.valid("json");
    const messageId = body.message_id?.trim() || randomUUID();
    const inboxKey = `inbox/${messageId}`;
    const fromEmail =
      deps.inboundEnv.ORBITA_INSTANCE_FROM_EMAIL?.trim() || "orbita@get-orbita.com";

    let sessionId = await getMemoryByKey(deps.memoryDb, clientId, sessionMemoryKey(body.from));
    if (!sessionId) {
      const session = await createSession(deps.sessionsDb, clientId, profileId);
      sessionId = session.id;
      await upsertMemory(
        deps.memoryDb,
        clientId,
        sessionMemoryKey(body.from),
        sessionId,
        deps.memoryEnv,
      );
    }

    await upsertMemory(
      deps.memoryDb,
      clientId,
      inboxKey,
      JSON.stringify({
        from: body.from,
        to: body.to,
        subject: body.subject,
        text: body.text,
        message_id: messageId,
        received_at: new Date().toISOString(),
      }),
      deps.memoryEnv,
    );

    const prompt = [
      "Inbound email received for this Orbita instance.",
      `From: ${body.from}`,
      `To: ${body.to}`,
      `Subject: ${body.subject}`,
      `Message-ID: ${messageId}`,
      "",
      "Body:",
      body.text,
      "",
      "Tasks: summarize, memory_put any registration links or codes.",
      `If replying: http_post https://api.zeabur.com/api/v1/zsend/emails with credential_ref zsend, JSON from ${fromEmail} to ${body.from}, subject Re: ${body.subject}, html or text body.`,
      "Do not publish without approval.",
    ].join("\n");

    await postMessage(
      deps.sessionsDb,
      sessionId,
      clientId,
      { type: "text", text: prompt },
      false,
      deps.runTurn,
      deps.summarizer,
    );

    await logTrajectoryEvent(deps.trajectoryDb, {
      sessionId,
      clientId,
      eventType: "inbound_email",
      payload: {
        from: body.from,
        to: body.to,
        subject: body.subject,
        message_id: messageId,
        inbox_key: inboxKey,
      },
    });

    return c.json({ session_id: sessionId, inbox_key: inboxKey, processed: true as const }, 200);
  });

  return app;
}
