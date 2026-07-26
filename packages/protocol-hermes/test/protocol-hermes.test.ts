import { describe, expect, it } from "vitest";

import { createStoreSnapshotFromCodexRuntimeFeed } from "../../protocol-codex/src/index";
import {
  createHermesProtocolEnvelope,
  createStoreSnapshotFromHermesRuntimeFeed,
  type HermesRuntimeFeed
} from "../src/index";

describe("protocol-hermes", () => {
  it("normalizes Hermes runtime data into a store snapshot", () => {
    const feed: HermesRuntimeFeed = {
      profileName: "Operator",
      threads: [
        {
          id: "hermes-thread-1",
          title: "Review SubMind bridge",
          workspacePath:
            "/mnt/c/Users/xtrem/OneDrive/Documents/codecraft/SubMind",
          createdAt: 1774856904348,
          updatedAt: 1774857543062,
          latestUserMessage: "Check the neutral MCP bridge.",
          modelName: "Hermes Agent",
          modelId: "hermes-agent",
          descriptorHints: ["mcp"],
          turns: [
            {
              id: "turn-1",
              timestamp: 1774857496782,
              prompt: "Check the neutral MCP bridge.",
              response: "The bridge can be registered by MCP-capable clients.",
              modelId: "hermes-agent",
              toolNames: ["apply_patch"],
              referencedFiles: ["packages/protocol-mcp/src/mcp-server.ts"],
              fileChanges: [
                {
                  path: "packages/protocol-mcp/src/mcp-server.ts",
                  changeType: "updated",
                  summary: "Moved the MCP server to a neutral package."
                }
              ]
            }
          ]
        }
      ]
    };

    const snapshot = createStoreSnapshotFromHermesRuntimeFeed(feed);

    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.threads).toHaveLength(1);
    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.events.some((event) => event.eventType === "hermes_response")).toBe(true);
    expect(snapshot.events.some((event) => event.metadata.source === "hermes")).toBe(true);
    expect(snapshot.fileChanges[0]?.fileType).toBe("source");
    expect(snapshot.projects[0]?.workspacePath).toBe(
      "C:/Users/xtrem/OneDrive/Documents/codecraft/SubMind"
    );
  });

  it("matches the same project id as Codex for equivalent workspace paths", () => {
    const hermesSnapshot = createStoreSnapshotFromHermesRuntimeFeed({
      profileName: "Operator",
      threads: [
        {
          id: "hermes-thread-1",
          title: "Review SubMind bridge",
          workspacePath:
            "/mnt/c/Users/xtrem/OneDrive/Documents/codecraft/SubMind",
          createdAt: 1774856904348,
          updatedAt: 1774857543062,
          latestUserMessage: "Check the neutral MCP bridge.",
          modelName: "Hermes Agent",
          modelId: "hermes-agent",
          descriptorHints: ["mcp"],
          turns: [
            {
              id: "turn-1",
              timestamp: 1774857496782,
              prompt: "Check the neutral MCP bridge.",
              response: "The bridge can be registered by MCP-capable clients.",
              modelId: "hermes-agent",
              toolNames: [],
              referencedFiles: [],
              fileChanges: []
            }
          ]
        }
      ]
    });
    const codexSnapshot = createStoreSnapshotFromCodexRuntimeFeed({
      profileName: "Operator",
      threads: [
        {
          id: "thread-1",
          title: "Review bridge",
          cwd: "C:/Users/xtrem/OneDrive/Documents/codecraft/SubMind",
          createdAt: 1774866000,
          updatedAt: 1774869600,
          gitBranch: "main",
          gitOriginUrl: null,
          firstUserMessage: "Review the bridge package.",
          descriptorHints: ["typescript", "tauri"]
        }
      ],
      events: [],
      fileChanges: []
    });

    expect(hermesSnapshot.projects[0]?.id).toBe(codexSnapshot.projects[0]?.id);
  });

  it("builds a Hermes protocol envelope from the active session/thread slice", () => {
    const snapshot = createStoreSnapshotFromHermesRuntimeFeed({
      profileName: "Operator",
      threads: [
        {
          id: "hermes-thread-1",
          title: "Review SubMind bridge",
          workspacePath:
            "C:/Users/xtrem/OneDrive/Documents/codecraft/SubMind",
          createdAt: 1774856904348,
          updatedAt: 1774857543062,
          latestUserMessage: "Check the neutral MCP bridge.",
          modelName: "Hermes Agent",
          modelId: "hermes-agent",
          descriptorHints: ["mcp"],
          turns: [
            {
              id: "turn-1",
              timestamp: 1774857496782,
              prompt: "Check the neutral MCP bridge.",
              response: "The bridge can be registered by MCP-capable clients.",
              modelId: "hermes-agent",
              toolNames: [],
              referencedFiles: [],
              fileChanges: []
            }
          ]
        }
      ]
    });
    const sessionId = snapshot.sessions[0]?.id ?? "";
    const threadId = snapshot.threads[0]?.id ?? "";
    const envelope = createHermesProtocolEnvelope(snapshot, sessionId, threadId);

    expect(envelope.source).toBe("hermes");
    expect(envelope.sessionId).toBe(sessionId);
    expect(envelope.threadId).toBe(threadId);
    expect(envelope.events.length).toBeGreaterThan(0);
  });
});
