export { createWaitlistDb, closeWaitlistDb, schema } from "./db/client.js";
export type { WaitlistDb } from "./db/client.js";
export { loadWaitlistEnv, parseAllowedOrigins } from "./config.js";
export type { WaitlistEnv } from "./config.js";
export {
  createWaitlistEntry,
  ensureWaitlistSchema,
  listWaitlistEntries,
  normalizeEmail,
  updateWaitlistEntry,
  approveWaitlistEntryWithInvite,
} from "./service.js";
export type { ApproveWaitlistResult } from "./service.js";
export { createWaitlistPublicRoutes } from "./routes/public.js";
export { createWaitlistAdminRoutes } from "./routes/admin.js";
export type { WaitlistAdminDeps } from "./routes/admin.js";
