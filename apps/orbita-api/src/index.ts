import { serve } from "@hono/node-server";
import { OpenAPIHono } from "@hono/zod-openapi";
import {
  createAdminAuthMiddleware,
  createAdminConsoleRoutes,
  createAdminDb,
  createAdminObservabilityRoutes,
  createAdminSessionRoutes,
  createAdminSettingsRoutes,
  createDeviceAuthRoutes,
  loadDeploymentHttpPolicy,
} from "@orbita/admin";
import {
  createAgentTurnRunner,
  createCapabilitiesResponse,
  createSessionSummarizer,
  loadAgentEnv,
} from "@orbita/agent";
import {
  createAdminRoutes,
  createAuthDb,
  createAuthMiddleware,
  createRateLimitMiddleware,
  getAuth,
} from "@orbita/auth";
import {
  createCredentialAdminRoutes,
  createCredentialListRoutes,
  createCredentialsDb,
  resolveCredentialSecret,
} from "@orbita/credentials";
import {
  createMemoryDb,
  createMemoryRoutes,
  createNoteLink,
  createNoteRoutes,
  getMemoryByKey,
  getMemoryContext,
  getNoteById,
  loadMemoryEnv,
  upsertMemory,
  upsertNote,
} from "@orbita/memory";
import {
  createErrorHandler,
  createHealthRoutes,
  createLogger,
  inputToPromptText,
  loadPlatformEnv,
  logRequest,
  requestIdMiddleware,
} from "@orbita/platform";
import { createSchedulerRoutes, createSchedulerDb, runScheduledAgentMessage, startSchedulerTick } from "@orbita/scheduler";
import {
  createSessionRoutes,
  createSessionsDb,
  getSessionForClient,
  type AgentTurnRunner,
} from "@orbita/sessions";
import {
  createWaitlistAdminRoutes,
  createWaitlistDb,
  createWaitlistPublicRoutes,
  ensureWaitlistSchema,
  loadWaitlistEnv,
} from "@orbita/waitlist";
import {
  createTrajectoryRoutes,
  createTrajectoryDb,
  logTrajectoryEvent,
} from "@orbita/trajectory";
import { createProfileRoutes } from "@orbita/profiles";
import {
  HARNESS_CAPABILITIES,
  createHarnessDb,
  createHarnessRoutes,
  startHarnessTick,
} from "@orbita/harness";
import { createInboundEmailRoutes } from "./inbound-email.js";
import { runMigrations } from "./migrate.js";
import { createE2eMockTurnRunner } from "./e2e-mock.js";

const E2E_MOCK = process.env.ORBITA_E2E_MOCK === "1";

const VERSION = "0.0.1-w32";
const env = loadPlatformEnv();
const agentEnv = loadAgentEnv();
const memoryEnv = loadMemoryEnv();
const waitlistEnv = loadWaitlistEnv();
const logger = createLogger(env.NODE_ENV);

if (!env.DATABASE_URL) {
  logger.error("DATABASE_URL is required");
  process.exit(1);
}

if (!env.ORBITA_ADMIN_TOKEN) {
  logger.error("ORBITA_ADMIN_TOKEN is required for admin routes");
  process.exit(1);
}

if (!env.ORBITA_SECRETS_KEY) {
  logger.error("ORBITA_SECRETS_KEY is required for credential vault");
  process.exit(1);
}

await runMigrations(env.DATABASE_URL, logger);

const authDb = createAuthDb(env.DATABASE_URL);
const sessionsDb = createSessionsDb(env.DATABASE_URL);
const memoryDb = createMemoryDb(env.DATABASE_URL);
const trajectoryDb = createTrajectoryDb(env.DATABASE_URL);
const schedulerDb = createSchedulerDb(env.DATABASE_URL);
const harnessDb = createHarnessDb(env.DATABASE_URL);
const credentialsDb = createCredentialsDb(env.DATABASE_URL);
const adminDb = createAdminDb(env.DATABASE_URL);
const waitlistDb = createWaitlistDb(env.DATABASE_URL);

await ensureWaitlistSchema(waitlistDb);

await loadDeploymentHttpPolicy(adminDb);

const publicBaseUrl =
  env.ORBITA_PUBLIC_BASE_URL ?? `http://${env.HOST === "0.0.0.0" ? "127.0.0.1" : env.HOST}:${env.PORT}`;

const authMiddleware = createAuthMiddleware(authDb);
const rateLimitMiddleware = createRateLimitMiddleware(
  authDb,
  env.RATE_LIMIT_PER_MINUTE,
);
const adminAuthMiddleware = createAdminAuthMiddleware(
  env.ORBITA_ADMIN_TOKEN,
  env.ORBITA_SECRETS_KEY,
);
const sessionSummarizer = createSessionSummarizer(agentEnv);

const assertSessionOwner = (sessionId: string, clientId: string) =>
  getSessionForClient(sessionsDb, sessionId, clientId).then(() => undefined);

const baseTurnRunner = E2E_MOCK
  ? createE2eMockTurnRunner()
  : createAgentTurnRunner(agentEnv, {
      resolveCredential: (clientId, name) =>
        resolveCredentialSecret(credentialsDb, env.ORBITA_SECRETS_KEY!, clientId, name),
      putMemory: (clientId, key, content) =>
        upsertMemory(memoryDb, clientId, key, content, memoryEnv),
      getMemory: (clientId, key) => getMemoryByKey(memoryDb, clientId, key),
      putNote: async (clientId, input) => {
        const note = await upsertNote(memoryDb, clientId, input, memoryEnv);
        return {
          id: note.id,
          title: note.title,
          updated_at: note.updated_at,
        };
      },
      getNote: async (clientId, id) => {
        const note = await getNoteById(memoryDb, clientId, id);
        if (!note) return null;
        return {
          id: note.id,
          title: note.title,
          body: note.body,
          frontmatter: note.frontmatter,
          updated_at: note.updated_at,
        };
      },
      linkNotes: async (clientId, fromId, toId, rel) => {
        const link = await createNoteLink(memoryDb, clientId, fromId, toId, rel);
        return {
          from_id: link.from_id,
          to_id: link.to_id,
          rel: link.rel,
        };
      },
      onToolTrace: (event) => {
        logTrajectoryEvent(trajectoryDb, {
          sessionId: event.sessionId,
          clientId: event.clientId,
          eventType:
            event.phase === "start" ? "tool_call_start" : "tool_call_complete",
          payload: {
            tool_name: event.tool_name,
            args: event.args,
            success: event.success,
            error: event.error,
            duration_ms: event.duration_ms,
          },
        });
      },
    });
const runTurn: AgentTurnRunner = async (args) => {
  const memoryContext = await getMemoryContext(memoryDb, args.session.clientId, {
    queryText: inputToPromptText(args.userInput),
    env: memoryEnv,
  });
  const result = await baseTurnRunner({ ...args, memoryContext });
  await logTrajectoryEvent(trajectoryDb, {
    sessionId: args.session.id,
    clientId: args.session.clientId,
    eventType: "turn_complete",
    payload: {
      execution_meta: result.execution_meta,
      user_input: args.userInput,
    },
  });
  return result;
};

const app = new OpenAPIHono();
app.onError(createErrorHandler(logger));
app.use("*", requestIdMiddleware);
app.use("*", async (c, next) => {
  const started = Date.now();
  await next();
  logRequest(logger, c, c.res.status, Date.now() - started);
});

app.route("/", createAdminConsoleRoutes({ assetVersion: VERSION }));

app.route("/v1", createHealthRoutes(VERSION));
app.route("/v1", createProfileRoutes());

app.route("/v1/auth", createDeviceAuthRoutes(
  adminDb,
  env.ORBITA_SECRETS_KEY,
  env.ORBITA_ADMIN_TOKEN,
  publicBaseUrl,
));

const adminApp = new OpenAPIHono();
adminApp.use("*", adminAuthMiddleware);
adminApp.route("/", createAdminSessionRoutes(env.ORBITA_ADMIN_TOKEN, env.ORBITA_SECRETS_KEY));
adminApp.route("/", createAdminSettingsRoutes(adminDb));
adminApp.route("/", createAdminObservabilityRoutes(adminDb, {
  defaultRateLimitPerMinute: env.RATE_LIMIT_PER_MINUTE,
  quotas: {
    sessionsPerDay: env.ORBITA_QUOTA_SESSIONS_PER_DAY,
    messagesPerDay: env.ORBITA_QUOTA_MESSAGES_PER_DAY,
  },
}));
adminApp.route(
  "/",
  createCredentialAdminRoutes(credentialsDb, env.ORBITA_SECRETS_KEY!),
);
adminApp.route("/", createAdminRoutes(authDb));
adminApp.route("/", createWaitlistAdminRoutes({ waitlistDb, authDb, waitlistEnv }));

app.route("/v1/admin", adminApp);

app.route("/v1", createWaitlistPublicRoutes(waitlistDb, waitlistEnv));
app.route(
  "/v1",
  createInboundEmailRoutes({
    inboundEnv: {
      ORBITA_INBOUND_EMAIL_TOKEN: env.ORBITA_INBOUND_EMAIL_TOKEN,
      ORBITA_INBOUND_CLIENT_ID: env.ORBITA_INBOUND_CLIENT_ID,
      ORBITA_INBOUND_AGENT_PROFILE: env.ORBITA_INBOUND_AGENT_PROFILE,
      ORBITA_INSTANCE_FROM_EMAIL: env.ORBITA_INSTANCE_FROM_EMAIL,
    },
    sessionsDb,
    memoryDb,
    memoryEnv,
    trajectoryDb,
    runTurn,
    summarizer: sessionSummarizer,
  }),
);

const protectedApp = new OpenAPIHono();
protectedApp.use("*", authMiddleware);
protectedApp.use("*", rateLimitMiddleware);

protectedApp.get("/whoami", (c) => {
  const auth = getAuth(c);
  return c.json({
    client_id: auth.clientId,
    key_prefix: auth.apiKey.keyPrefix,
    scopes: auth.apiKey.scopes,
  });
});

protectedApp.get("/capabilities", (c) =>
  c.json(
    {
      ...createCapabilitiesResponse(publicBaseUrl),
      harness: HARNESS_CAPABILITIES,
    },
    200,
  ),
);

protectedApp.route("/", createSessionRoutes(sessionsDb, runTurn, sessionSummarizer, {
  sessionsPerDay: env.ORBITA_QUOTA_SESSIONS_PER_DAY,
  messagesPerDay: env.ORBITA_QUOTA_MESSAGES_PER_DAY,
}));
protectedApp.route("/", createMemoryRoutes(memoryDb, memoryEnv));
protectedApp.route("/", createNoteRoutes(memoryDb, memoryEnv));
protectedApp.route("/", createTrajectoryRoutes(trajectoryDb, assertSessionOwner));
protectedApp.route("/", createSchedulerRoutes(schedulerDb, assertSessionOwner));
protectedApp.route(
  "/",
  createHarnessRoutes({
    harnessDb,
    sessionsDb,
    memoryDb,
    memoryEnv,
    runTurn,
    summarizer: sessionSummarizer,
  }),
);
protectedApp.route("/", createCredentialListRoutes(credentialsDb));

app.route("/v1", protectedApp);

app.doc("/v1/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Orbita API",
    version: VERSION,
    description: "Agent-native, API-first agent system",
  },
});

startSchedulerTick(
  schedulerDb,
  async (job) => {
    logger.info({ job_id: job.id, session_id: job.sessionId }, "scheduler tick");
    await logTrajectoryEvent(trajectoryDb, {
      sessionId: job.sessionId,
      clientId: job.clientId,
      eventType: "scheduled_job_tick",
      payload: { task: job.task, output_routing: job.outputRouting },
    });

    const agentResult = await runScheduledAgentMessage(
      sessionsDb,
      job.sessionId,
      job.clientId,
      job.task as Record<string, unknown>,
      runTurn,
      sessionSummarizer,
    );
    if (agentResult.ran) {
      logger.info({ job_id: job.id, session_id: job.sessionId }, "scheduled agent_message completed");
      await logTrajectoryEvent(trajectoryDb, {
        sessionId: job.sessionId,
        clientId: job.clientId,
        eventType: "scheduled_agent_turn",
        payload: { task: job.task },
      });
    } else if (agentResult.error) {
      logger.warn(
        { job_id: job.id, session_id: job.sessionId, error: agentResult.error },
        "scheduled agent_message failed",
      );
    }
  },
  logger,
);

startHarnessTick(
  harnessDb,
  sessionsDb,
  runTurn,
  { memoryDb, memoryEnv },
  sessionSummarizer,
  logger,
);

logger.info(
  { host: env.HOST, port: env.PORT, version: VERSION },
  "starting orbita-api",
);

serve(
  {
    fetch: app.fetch,
    hostname: env.HOST,
    port: env.PORT,
  },
  (info) => {
    logger.info(
      { url: `http://${info.address}:${info.port}`, admin: `/admin` },
      "orbita-api listening",
    );
  },
);
