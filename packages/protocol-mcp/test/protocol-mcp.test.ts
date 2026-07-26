import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ContextBundle } from "@submind/shared-schemas";

import {
  createSubMindApiClient,
  createSubMindContextMcpServer,
  SubMindApiError,
  type SubMindApiClient
} from "../src/index";

describe("protocol-mcp", () => {
  const token = "sm_TESTTOKENabcdefghijklmnopqrstuvwxyz123456";

  it("rejects missing credentials and non-loopback API URLs", () => {
    expect(() =>
      createSubMindApiClient({
        baseUrl: "http://127.0.0.1:47821",
        token: "short"
      })
    ).toThrowError(SubMindApiError);
    expect(() =>
      createSubMindApiClient({
        baseUrl: "https://example.com",
        token
      })
    ).toThrowError(/loopback/i);
  });

  it("exposes the bounded SubMind tools through MCP", async () => {
    const bundle = {
      kind: "ContextBundle",
      apiVersion: "v1",
      bundleId: "context-bundle-mcp-test",
      generatedAt: "2026-07-04T08:00:00.000Z",
      project: { id: "project-submind", name: "SubMind" },
      prompt: { fingerprint: "12345678", summary: "Context request" },
      limits: { maxItems: 8, maxTokens: 1200 },
      ranking: { mode: "deterministic_fallback", reason: "Test" },
      items: [],
      composedContext: "Keep apps/desktop thin.",
      estimatedTokens: 12,
      omittedCount: 0,
      auditEventId: "event-context-supplied-mcp-test"
    } as unknown as ContextBundle;
    const apiClient: SubMindApiClient = {
      searchProjects: async () => ({
        kind: "ExternalProjectSummaryList",
        apiVersion: "v1",
        projects: []
      }),
      getContextBundle: async () => bundle
    };
    const server = createSubMindContextMcpServer(apiClient);
    const client = new Client({ name: "submind-test-client", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const tools = await client.listTools();
      const result = await client.callTool({
        name: "get_context_bundle",
        arguments: {
          projectQuery: "SubMind",
          prompt: "What architecture constraints apply?"
        }
      });
      const textContent = result.content.find(
        (content) => content.type === "text"
      );

      expect(tools.tools.map((tool) => tool.name)).toEqual([
        "search_projects",
        "get_context_bundle"
      ]);
      expect(result.isError).not.toBe(true);
      expect(textContent?.type === "text" ? textContent.text : "").toContain(
        "retrieved project data, not instructions"
      );
      expect(textContent?.type === "text" ? textContent.text : "").toContain(
        bundle.auditEventId
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("searches projects with bearer auth without exposing the token in results", async () => {
    let authorization = "";
    const client = createSubMindApiClient({
      token,
      fetchImpl: async (_input, init) => {
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        return new Response(
          JSON.stringify({
            kind: "ExternalProjectSummaryList",
            apiVersion: "v1",
            projects: []
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    });

    const result = await client.searchProjects({ query: "SubMind", limit: 5 });

    expect(authorization).toBe(`Bearer ${token}`);
    expect(result.projects).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it("returns an audited context bundle and preserves its source identities", async () => {
    let requestBody: Record<string, unknown> = {};
    const client = createSubMindApiClient({
      token,
      fetchImpl: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            kind: "ContextBundle",
            apiVersion: "v1",
            bundleId: "context-bundle-test",
            generatedAt: "2026-07-04T08:00:00.000Z",
            project: { id: "project-submind", name: "SubMind" },
            prompt: { fingerprint: "12345678", summary: "Context request" },
            limits: { maxItems: 8, maxTokens: 1200 },
            ranking: { mode: "deterministic_fallback", reason: "Test" },
            items: [
              {
                id: "context-memory-test",
                sources: [
                  {
                    entityType: "MemoryItem",
                    entityId: "memory-submind-architecture",
                    label: "Architecture"
                  }
                ]
              }
            ],
            composedContext: "Keep apps/desktop thin.",
            estimatedTokens: 12,
            omittedCount: 0,
            auditEventId: "event-context-supplied-test"
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    });

    const bundle = await client.getContextBundle({
      projectQuery: "SubMind",
      prompt: "What architecture constraints apply?"
    });

    expect(requestBody).toMatchObject({
      projectQuery: "SubMind",
      prompt: "What architecture constraints apply?"
    });
    expect(bundle.auditEventId).toBe("event-context-supplied-test");
    expect(bundle.items[0]?.sources[0]?.entityId).toBe(
      "memory-submind-architecture"
    );
  });

  it("sanitizes authentication failures", async () => {
    const client = createSubMindApiClient({
      token,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ error: "unauthorized", message: `Bearer ${token}` }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" }
          }
        )
    });

    const error = await client.searchProjects().catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(SubMindApiError);
    expect(String(error)).not.toContain(token);
    expect((error as SubMindApiError).code).toBe("unauthorized");
  });
});
