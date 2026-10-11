export { createAuthDb, closeAuthDb, schema } from "./db/client.js";
export type { AuthDb } from "./db/client.js";
export {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  findActiveApiKeyByPlaintext,
  hashApiKey,
  isClientIdAllowed,
} from "./services/api-keys.js";
export type { CreateApiKeyInput, CreateApiKeyResult, ApiKeySummary } from "./services/api-keys.js";
export {
  createAuthMiddleware,
  extractBearerToken,
  getAuth,
  requireScope,
} from "./middleware/auth.js";
export { createRateLimitMiddleware } from "./middleware/rate-limit.js";
export type { AuthContext } from "./middleware/auth.js";
export {
  authFailConfigFromPlatformEnv,
  AuthFailEnvSchema,
} from "./auth-fail/config.js";
export type { AuthFailConfig } from "./auth-fail/config.js";
export { extractClientIp } from "./auth-fail/client-ip.js";
export {
  bearerKeyPrefix,
  createAuthFailGuard,
} from "./auth-fail/guard.js";
export type { AuthFailGuard, AuthFailureReason } from "./auth-fail/guard.js";
export { InMemoryAuthFailStore } from "./auth-fail/store.js";
export { createAuthFailPrecheckMiddleware } from "./middleware/auth-fail-precheck.js";
export {
  createScannerTripwireMiddleware,
  SCANNER_DECOY_PATHS,
} from "./middleware/scanner-tripwire.js";
export {
  createAdminAuthGuard,
  createAdminRoutes,
} from "./routes/admin.js";
export type { AdminAuthGuard } from "./routes/admin.js";
