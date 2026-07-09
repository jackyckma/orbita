import type { MemoryEnv } from "./config.js";
import type { MemoryDb } from "./db/client.js";
import { getNoteContext } from "./notes-service.js";
import { formatMemoryLines, getMemoryByKey } from "./service.js";

export type MemoryInjectConfig = {
  memory_keys?: string[];
  graph_from?: string;
  depth?: number;
  include_incoming?: boolean;
  vector_query?: string;
  top_k?: number;
};

export type ResolveMemoryInjectOptions = {
  queryText?: string;
};

export function resolveHarnessMemoryInject(
  config: {
    memory_inject?: MemoryInjectConfig;
    application?: Record<string, unknown>;
  },
): MemoryInjectConfig | undefined {
  if (config.memory_inject) return config.memory_inject;

  const rawKeys = config.application?.memory_keys;
  if (!Array.isArray(rawKeys) || rawKeys.length === 0) return undefined;

  const memory_keys = rawKeys.filter((key): key is string => typeof key === "string" && key.length > 0);
  return memory_keys.length > 0 ? { memory_keys } : undefined;
}

export async function resolveMemoryInject(
  db: MemoryDb,
  clientId: string,
  config: MemoryInjectConfig,
  env: MemoryEnv,
  options?: ResolveMemoryInjectOptions,
): Promise<string> {
  const sections: string[] = [];

  if (config.memory_keys?.length) {
    const rows: Array<{ key: string; content: string }> = [];
    for (const key of config.memory_keys) {
      const content = await getMemoryByKey(db, clientId, key);
      if (content != null) rows.push({ key, content });
    }
    const memoryLines = formatMemoryLines(rows);
    if (memoryLines) sections.push(memoryLines);
  }

  const queryText = config.vector_query?.trim() || options?.queryText?.trim();
  const hasGraph = Boolean(config.graph_from);
  if (hasGraph || queryText) {
    const noteContext = await getNoteContext(db, clientId, {
      graphFrom: config.graph_from,
      depth: config.depth,
      includeIncoming: config.include_incoming,
      queryText,
      env,
      topK: config.top_k,
    });
    if (noteContext) sections.push(noteContext);
  }

  return sections.join("\n\n");
}
