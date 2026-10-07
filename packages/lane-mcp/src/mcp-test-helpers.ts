import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { OrbitaMcpDeps } from "./index.js";
import { createOrbitaMcpServer } from "./index.js";

export type ListedMcpTool = {
  name: string;
  inputSchema: unknown;
};

export async function listMcpTools(deps: OrbitaMcpDeps): Promise<ListedMcpTool[]> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createOrbitaMcpServer(deps);
  await server.connect(serverTransport);
  const client = new Client({ name: "orbita-mcp-test", version: "0.0.0" });
  await client.connect(clientTransport);
  const { tools } = await client.listTools();
  await client.close();
  await server.close();
  return tools
    .map((t) => ({ name: t.name, inputSchema: t.inputSchema }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function initializeMcp(deps: OrbitaMcpDeps) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createOrbitaMcpServer(deps);
  await server.connect(serverTransport);
  const client = new Client({ name: "orbita-mcp-test", version: "0.0.0" });
  await client.connect(clientTransport);
  const instructions = client.getInstructions();
  return {
    instructions,
    async callTool(name: string, args: Record<string, unknown>) {
      return client.callTool({ name, arguments: args });
    },
    async close() {
      await client.close();
      await server.close();
    },
  };
}

export function minimalMcpDeps(
  overrides: Partial<OrbitaMcpDeps> = {},
): OrbitaMcpDeps {
  return {
    clientId: "tenant-a",
    keyPrefix: "test",
    apiKeyId: "key-1",
    scopes: ["sessions:use"],
    memoryDb: {} as OrbitaMcpDeps["memoryDb"],
    memoryEnv: {} as OrbitaMcpDeps["memoryEnv"],
    credentialsDb: {} as OrbitaMcpDeps["credentialsDb"],
    secretsKey: "test-secrets",
    version: "0.0.1-test",
    ticketsEnabled: false,
    ...overrides,
  };
}
