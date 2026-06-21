import { serve } from "@hono/node-server";
import { OpenAPIHono } from "@hono/zod-openapi";
import {
  createAgentTurnRunner,
  createCapabilitiesResponse,
  createSessionSummarizer,
  loadAgentEnv,
} from "@orbita/agent";
import {
  createAdminAuthGuard,
  createAdminRoutes,
  createAuthDb,
  createAuthMiddleware,
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
import {
  createSchedulerRoutes,
  createSchedulerDb,
  deliverJobOutput,
  startSchedulerTick,
} from "@orbita/scheduler";
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

const VERSION = "0.0.1-w6";
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

const authMiddleware = createAuthMiddleware(authDb);
const adminGuard = createAdminAuthGuard(env.ORBITA_ADMIN_TOKEN);
const sessionSummarizer = createSessionSummarizer(agentEnv);

const assertSessionOwner = (sessionId: string, clientId: string) =>
  getSessionForClient(sessionsDb, sessionId, clientId).then(() => undefined);

const baseTurnRunner = createAgentTurnRunner(agentEnv, {
  resolveCredential: (clientId, name) =>
    resolveCredentialSecret(credentialsDb, env.ORBITA_SECRETS_KEY!, clientId, name),
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

app.route("/v1", createHealthRoutes(VERSION));
app.route(
  "/v1/admin",
  createCredentialAdminRoutes(credentialsDb, env.ORBITA_SECRETS_KEY!, adminGuard),
);
app.route("/v1/admin", createAdminRoutes(authDb, adminGuard));

const protectedApp = new OpenAPIHono();
protectedApp.use("*", authMiddleware);

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

startSchedulerTick(schedulerDb, async (job) => {
  logger.info({ job_id: job.id, session_id: job.sessionId }, "scheduler tick");
  await logTrajectoryEvent(trajectoryDb, {
    sessionId: job.sessionId,
    clientId: job.clientId,
    eventType: "scheduled_job_tick",
    payload: { task: job.task, output_routing: job.outputRouting },
  });
  const delivery = await deliverJobOutput(
    job,
    { task: job.task },
    { logger: { info: logger.info.bind(logger), error: logger.error.bind(logger) } },
  );
  await logTrajectoryEvent(trajectoryDb, {
    sessionId: job.sessionId,
    clientId: job.clientId,
    eventType: "scheduled_job_webhook",
    payload: {
      mode: delivery.mode,
      delivered: delivery.delivered,
      ok: delivery.ok,
      status: delivery.status ?? null,
      error: delivery.error ?? null,
    },
  });
});

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
    logger.info({ url: `http://${info.address}:${info.port}` }, "orbita-api listening");
  },
);
