export { createMemoryDb, schema } from "./db/client.js";
export type { MemoryDb } from "./db/client.js";
export { loadMemoryEnv, MemoryEnvSchema } from "./config.js";
export type { MemoryEnv } from "./config.js";
export {
  formatMemoryLines,
  getMemoryByKey,
  getMemoryContext,
  listMemories,
  upsertMemory,
} from "./service.js";
export type { MemoryContextOptions } from "./service.js";
export { createMemoryRoutes } from "./routes/memories.js";
export { createNoteRoutes } from "./routes/notes.js";
export { embedText } from "./embed.js";
export {
  createNoteLink,
  formatNoteContextLines,
  getNoteById,
  getNoteContext,
  getNoteNeighbors,
  listNoteLinksFrom,
  listNoteLinksTo,
  listNotes,
  searchNotes,
  upsertNote,
} from "./notes-service.js";
export type {
  GetNoteNeighborsOptions,
  NoteContextOptions,
  NoteLinkRecord,
  NoteListItem,
  NoteNeighbor,
  NoteRecord,
  NoteSearchHit,
  UpsertNoteInput,
} from "./notes-service.js";
