export { createCredentialsDb, schema } from "./db/client.js";
export type { CredentialsDb } from "./db/client.js";
export {
  createCredential,
  listCredentials,
  resolveCredentialSecret,
} from "./service.js";
export {
  createCredentialAdminRoutes,
  createCredentialListRoutes,
} from "./routes/credentials.js";
export { encryptSecret, decryptSecret } from "./crypto.js";
