export { createHarnessDb, closeHarnessDb, schema } from "./db/client.js";
export type { HarnessDb } from "./db/client.js";
export { createHarnessRoutes } from "./routes/harnesses.js";
export { startHarnessTick, executeHarnessRun } from "./tick.js";
export {
  listHarnessTemplates,
  getHarnessTemplate,
  mergeHarnessConfig,
  deepMerge,
  templatePublicId,
} from "./templates.js";
export { HARNESS_CAPABILITIES, type HarnessCapabilities } from "./types.js";
