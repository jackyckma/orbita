import { serve } from "@hono/node-server";
import { OpenAPIHono } from "@hono/zod-openapi";
import {
  createAdminAuthGuard,
  createAdminRoutes,
  createAuthDb,
  createAuthMiddleware,
  getAuth,
} from "@orbita/auth";
import {
  createErrorHandler,
  createHealthRoutes,
  createLogger,
  loadPlatformEnv,
  logRequest,
  requestIdMiddleware,
} from "@orbita/platform";

const VERSION = "0.0.1-w0";
const env = loadPlatformEnv();
const logger = createLogger(env.NODE_ENV);

if (!env.DATABASE_URL) {
  logger.error("DATABASE_URL is required");
  process.exit(1);
}

if (!env.ORBITA_ADMIN_TOKEN) {
  logger.error("ORBITA_ADMIN_TOKEN is required for admin routes");
  process.exit(1);
}

const authDb = createAuthDb(env.DATABASE_URL);
const authMiddleware = createAuthMiddleware(authDb);
const adminGuard = createAdminAuthGuard(env.ORBITA_ADMIN_TOKEN);

const app = new OpenAPIHono();
app.onError(createErrorHandler(logger));
app.use("*", requestIdMiddleware);
app.use("*", async (c, next) => {
  const started = Date.now();
  await next();
  logRequest(logger, c, c.res.status, Date.now() - started);
});

app.route("/v1", createHealthRoutes(VERSION));

const adminRoutes = createAdminRoutes(authDb, adminGuard);
app.route("/v1/admin", adminRoutes);

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
app.route("/v1", protectedApp);

app.doc("/v1/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Orbita API",
    version: VERSION,
    description: "Agent-native, API-first agent system",
  },
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
