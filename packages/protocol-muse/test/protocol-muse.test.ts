import { describe, expect, it } from "vitest";

import {
  createMuseProtocolEnvelope,
  createMuseTaskAssignment,
  createStoreSnapshotFromMuseRuntimeFeed,
  museInboxScope,
  type MuseRuntimeFeed
} from "../src/index";

describe("protocol-muse", () => {
  it("normalizes Muse runtime data into a store snapshot", () => {
    const feed: MuseRuntimeFeed = {
      profileName: "Operator",
      chats: [
        {
          id: "muse-chat-1",
          title: "Build protocol-muse",
          createdAt: 1774856904348,
          updatedAt: 1774857543062,
          workspacePath:
            "/mnt/c/Users/xtrem/OneDrive/Documents/codecraft/SubMind",
          descriptorHints: ["submind", "protocol"],
          turns: [
            {
              id: "turn-1",
              timestamp: 1774857496782,
              prompt: "Build a Muse protocol layer for SubMind.",
              response: "Created packages/protocol-muse with feed normalization.",
              toolNames: ["muse.write", "muse.exec"],
              referencedFiles: ["packages/protocol-muse/src/index.ts"],
              fileChanges: [
                {
                  path: "packages/protocol-muse/src/index.ts",
                  changeType: "added",
                  summary: "Added the Muse protocol layer."
                }
              ]
            }
          ]
        }
      ]
    };

    const snapshot = createStoreSnapshotFromMuseRuntimeFeed(feed);

    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.threads).toHaveLength(1);
    expect(snapshot.tasks).toHaveLength(1);
    expect(
      snapshot.events.some((event) => event.eventType === "muse_response")
    ).toBe(true);
    expect(
      snapshot.events.some((event) => event.metadata.source === "muse")
    ).toBe(true);
    expect(snapshot.fileChanges[0]?.fileType).toBe("source");
    expect(snapshot.projects[0]?.workspacePath).toBe(
      "C:/Users/xtrem/OneDrive/Documents/codecraft/SubMind"
    );
    expect(snapshot.sessions[0]?.id).toBe("session-muse-muse-chat-1");
    expect(snapshot.threads[0]?.id).toBe("thread-muse-muse-chat-1");
  });

  it("groups chats without a workspace under the Muse global project", () => {
    const feed: MuseRuntimeFeed = {
      profileName: "Operator",
      chats: [
        {
          id: "muse-chat-2",
          title: "Quick question",
          createdAt: 1774856904348,
          updatedAt: 1774857543062,
          workspacePath: null,
          descriptorHints: [],
          turns: []
        }
      ]
    };

    const snapshot = createStoreSnapshotFromMuseRuntimeFeed(feed);

    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.projects[0]?.id).toBe("project-muse-global");
    expect(snapshot.projects[0]?.name).toBe("Muse Global Activity");
  });

  it("builds a protocol envelope for a session and thread", () => {
    const feed: MuseRuntimeFeed = {
      profileName: "Operator",
      chats: [
        {
          id: "muse-chat-3",
          title: "Envelope check",
          createdAt: 1774856904348,
          updatedAt: 1774857543062,
          workspacePath: null,
          descriptorHints: [],
          turns: [
            {
              id: "turn-1",
              timestamp: 1774857496782,
              prompt: "Hello",
              response: "Hi there.",
              toolNames: [],
              referencedFiles: [],
              fileChanges: []
            }
          ]
        }
      ]
    };

    const snapshot = createStoreSnapshotFromMuseRuntimeFeed(feed);
    const envelope = createMuseProtocolEnvelope(
      snapshot,
      "session-muse-muse-chat-3",
      "thread-muse-muse-chat-3"
    );

    expect(envelope.source).toBe("muse");
    expect(envelope.sessionId).toBe("session-muse-muse-chat-3");
    expect(envelope.threadId).toBe("thread-muse-muse-chat-3");
    expect(envelope.events.length).toBeGreaterThan(0);
  });

  it("creates queued task assignments for the Muse inbox", () => {
    const task = createMuseTaskAssignment(
      {
        title: "Review the SubMind bridge",
        summary: "Check the neutral MCP bridge wiring.",
        priority: "high"
      },
      1774857543062
    );

    expect(task.kind).toBe("Task");
    expect(task.status).toBe("queued");
    expect(task.priority).toBe("high");
    expect(task.sessionId).toBe(museInboxScope.sessionId);
    expect(task.threadId).toBe(museInboxScope.threadId);
    expect(task.projectId).toBe(museInboxScope.projectId);
    expect(task.id.startsWith("task-muse-inbox-")).toBe(true);
  });
});
