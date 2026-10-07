/** mcp-golden: legacy 16-tool baseline when tickets flag is off. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ORBITA_MCP_SERVER_INSTRUCTIONS } from "./mcp-instructions.js";
import { initializeMcp, listMcpTools, minimalMcpDeps } from "./mcp-test-helpers.js";

const baselinePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../test-fixtures/mcp-tools-baseline.json",
);

const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
  tools: Array<{ name: string; inputSchema: unknown }>;
};

describe("MCP tool golden (tickets flag off)", () => {
  it("lists exactly 16 legacy tools with unchanged input schemas", async () => {
    const tools = await listMcpTools(minimalMcpDeps());
    expect(tools).toEqual(baseline.tools);
  });

  it("sets initialize instructions (always, including tickets off)", async () => {
    const session = await initializeMcp(minimalMcpDeps());
    expect(session.instructions).toBe(ORBITA_MCP_SERVER_INSTRUCTIONS);
    expect(session.instructions).toContain("ticket_propose");
    expect(session.instructions).toContain("ticket-executors");
    await session.close();
  });
});
