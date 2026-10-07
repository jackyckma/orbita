export { createCredentialsDb, schema } from "./db/client.js";
export type { CredentialsDb } from "./db/client.js";
export {
  createCredential,
  deleteCredential,
  listCredentials,
  replaceCredentialSecret,
  resolveCredentialSecret,
  setCredentialExpiry,
} from "./service.js";
export { formatCredentialMetadata } from "./credential-meta.js";
export {
  createCredentialAdminRoutes,
  createCredentialListRoutes,
} from "./routes/credentials.js";
export { encryptSecret, decryptSecret } from "./crypto.js";
