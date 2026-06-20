export { createAuthDb, closeAuthDb, schema } from "./db/client.js";
export type { AuthDb } from "./db/client.js";
export {
  createApiKey,
  revokeApiKey,
  findActiveApiKeyByPlaintext,
  hashApiKey,
  isClientIdAllowed,
} from "./services/api-keys.js";
export type { CreateApiKeyInput, CreateApiKeyResult } from "./services/api-keys.js";
export {
  createAuthMiddleware,
  extractBearerToken,
  getAuth,
  requireScope,
} from "./middleware/auth.js";
export type { AuthContext } from "./middleware/auth.js";
export {
  createAdminAuthGuard,
  createAdminRoutes,
} from "./routes/admin.js";
export type { AdminAuthGuard } from "./routes/admin.js";
