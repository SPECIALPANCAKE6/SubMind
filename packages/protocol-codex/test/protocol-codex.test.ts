import { describe, expect, it } from "vitest";
import {
  createCodexProtocolEnvelope,
  createStoreSnapshotFromCodexRuntimeFeed,
  type CodexRuntimeFeed
} from "../src/index";

describe("protocol-codex", () => {
  it("normalizes local codex runtime data into a store snapshot", () => {
    const feed: CodexRuntimeFeed = {
      profileName: "Operator",
      threads: [
        {
          id: "thread-1",
          title: "Read AGENTS and start",
          cwd: "C:/Workspace/SubMind",
          createdAt: 1774866000,
          updatedAt: 1774869600,
          gitBranch: "main",
          gitOriginUrl: null,
          firstUserMessage: "Read AGENTS.md and start implementing SubMind.",
          descriptorHints: ["workspace", "typescript", "tauri"]
        }
      ],
      events: [
        {
          id: "event-1",
          threadId: "thread-1",
          timestamp: "2026-03-29T18:30:00.000Z",
          type: "user_message",
          summary: "Read AGENTS.md and start implementing SubMind.",
          metadata: {
            turnId: "turn-1"
          }
        },
        {
          id: "event-2",
          threadId: "thread-1",
          timestamp: "2026-03-29T18:41:00.000Z",
          type: "apply_patch",
          summary: "Applied patch touching 2 files.",
          metadata: {
            fileCount: 2
          }
        }
      ],
      fileChanges: [
        {
          id: "change-1",
          threadId: "thread-1",
          eventId: "event-2",
          timestamp: "2026-03-29T18:41:00.000Z",
          path: "apps/desktop/src/index.ts",
          changeType: "updated",
          summary: "Updated desktop bootstrap."
        }
      ]
    };

    const snapshot = createStoreSnapshotFromCodexRuntimeFeed(
      feed,
      new Date("2026-03-29T20:00:00.000Z").valueOf()
    );

    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.threads).toHaveLength(1);
    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.events[0]?.originType).toBe("codex");
    expect(snapshot.fileChanges[0]?.fileType).toBe("source");
    expect(snapshot.actions).toHaveLength(0);
  });

  it("builds a codex protocol envelope from the active session/thread slice", () => {
    const snapshot = createStoreSnapshotFromCodexRuntimeFeed({
      profileName: "Operator",
      threads: [
        {
          id: "thread-1",
          title: "Read AGENTS and start",
          cwd: "C:/Workspace/SubMind",
          createdAt: 1774866000,
          updatedAt: 1774869600,
          gitBranch: "main",
          gitOriginUrl: null,
          firstUserMessage: "Read AGENTS.md and start implementing SubMind.",
          descriptorHints: ["workspace", "typescript", "tauri"]
        }
      ],
      events: [
        {
          id: "event-1",
          threadId: "thread-1",
          timestamp: "2026-03-29T18:30:00.000Z",
          type: "user_message",
          summary: "Read AGENTS.md and start implementing SubMind.",
          metadata: {}
        }
      ],
      fileChanges: []
    });

    const sessionId = snapshot.sessions[0]?.id ?? "";
    const threadId = snapshot.threads[0]?.id ?? "";
    const envelope = createCodexProtocolEnvelope(snapshot, sessionId, threadId);

    expect(envelope.sessionId).toBe(sessionId);
    expect(envelope.threadId).toBe(threadId);
    expect(envelope.events).toHaveLength(1);
  });
});
