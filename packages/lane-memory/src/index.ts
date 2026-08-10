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
export {
  resolveHarnessMemoryInject,
  resolveMemoryInject,
} from "./memory-inject.js";
export type {
  MemoryInjectConfig,
  ResolveMemoryInjectOptions,
} from "./memory-inject.js";
export { createMemoryRoutes } from "./routes/memories.js";
export { createNoteRoutes } from "./routes/notes.js";
export { embedText } from "./embed.js";
export type { EmbedPurpose, EmbedTextOptions } from "./embed.js";
export {
  createNoteLink,
  exportNotes,
  formatNoteContextLines,
  formatNoteExportBody,
  getNoteById,
  getNoteContext,
  getNoteNeighbors,
  listNoteLinksFrom,
  listNoteLinksTo,
  listNotes,
  noteExportPath,
  searchNotes,
  upsertNote,
} from "./notes-service.js";
export type {
  GetNoteNeighborsOptions,
  NoteContextOptions,
  NoteExportFile,
  NoteLinkRecord,
  NoteListItem,
  NoteNeighbor,
  NoteRecord,
  NoteSearchHit,
  NotesExport,
  UpsertNoteInput,
} from "./notes-service.js";
