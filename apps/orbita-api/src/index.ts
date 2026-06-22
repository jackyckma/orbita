import { serve } from "@hono/node-server";
import { OpenAPIHono } from "@hono/zod-openapi";
import {
  createAdminAuthMiddleware,
  createAdminConsoleRoutes,
  createAdminDb,
  createAdminSessionRoutes,
  createAdminSettingsRoutes,
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
  getMemoryContext,
  loadMemoryEnv,
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
import { createSchedulerRoutes, createSchedulerDb, startSchedulerTick } from "@orbita/scheduler";
import {
  createSessionRoutes,
  createSessionsDb,
  getSessionForClient,
  type AgentTurnRunner,
} from "@orbita/sessions";
import {
  createTrajectoryRoutes,
  createTrajectoryDb,
  logTrajectoryEvent,
} from "@orbita/trajectory";
import { runMigrations } from "./migrate.js";
import { createE2eMockTurnRunner } from "./e2e-mock.js";

const E2E_MOCK = process.env.ORBITA_E2E_MOCK === "1";

const VERSION = "0.0.1-w11";
const env = loadPlatformEnv();
const agentEnv = loadAgentEnv();
const memoryEnv = loadMemoryEnv();
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
const credentialsDb = createCredentialsDb(env.DATABASE_URL);
const adminDb = createAdminDb(env.DATABASE_URL);

await loadDeploymentHttpPolicy(adminDb);

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

app.route("/", createAdminConsoleRoutes());

app.route("/v1", createHealthRoutes(VERSION));

const adminApp = new OpenAPIHono();
adminApp.use("*", adminAuthMiddleware);
adminApp.route("/", createAdminSessionRoutes(env.ORBITA_ADMIN_TOKEN, env.ORBITA_SECRETS_KEY));
adminApp.route("/", createAdminSettingsRoutes(adminDb));
adminApp.route(
  "/",
  createCredentialAdminRoutes(credentialsDb, env.ORBITA_SECRETS_KEY!),
);
adminApp.route("/", createAdminRoutes(authDb));

app.route("/v1/admin", adminApp);

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

protectedApp.get("/capabilities", (c) => c.json(createCapabilitiesResponse(), 200));

protectedApp.route("/", createSessionRoutes(sessionsDb, runTurn, sessionSummarizer));
protectedApp.route("/", createMemoryRoutes(memoryDb, memoryEnv));
protectedApp.route("/", createTrajectoryRoutes(trajectoryDb, assertSessionOwner));
protectedApp.route("/", createSchedulerRoutes(schedulerDb, assertSessionOwner));
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
  },
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
