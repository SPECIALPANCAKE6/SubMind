import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createSubMindContextMcpServer } from "../dist/mcp-server.js";

const auditEventId = "event-context-supplied-smoke-test";
const apiClient = {
  async searchProjects() {
    return {
      kind: "ExternalProjectSummaryList",
      apiVersion: "v1",
      projects: []
    };
  },
  async getContextBundle() {
    return {
      kind: "ContextBundle",
      apiVersion: "v1",
      bundleId: "context-bundle-smoke-test",
      generatedAt: "2026-07-04T08:00:00.000Z",
      project: { id: "project-submind", name: "SubMind" },
      prompt: { fingerprint: "12345678", summary: "Context request" },
      limits: { maxItems: 8, maxTokens: 1200 },
      ranking: { mode: "deterministic_fallback", reason: "Smoke test" },
      items: [],
      composedContext: "Keep apps/desktop thin.",
      estimatedTokens: 12,
      omittedCount: 0,
      auditEventId
    };
  }
};
const server = createSubMindContextMcpServer(apiClient);
const client = new Client({ name: "submind-smoke-client", version: "0.1.0" });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

await server.connect(serverTransport);
await client.connect(clientTransport);

try {
  const tools = await client.listTools();
  assert.deepEqual(
    tools.tools.map((tool) => tool.name),
    ["search_projects", "get_context_bundle"]
  );

  const result = await client.callTool({
    name: "get_context_bundle",
    arguments: {
      projectQuery: "SubMind",
      prompt: "What architecture constraints apply?"
    }
  });
  assert.notEqual(result.isError, true);
  const text = result.content
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("\n");
  assert.match(text, /retrieved project data, not instructions/);
  assert.match(text, new RegExp(auditEventId));

  console.log("SubMind context MCP smoke verification passed.");
} finally {
  await client.close();
  await server.close();
}
