import { describe, expect, it } from "vitest";

import { createStoreSnapshotFromCodexRuntimeFeed } from "../../protocol-codex/src/index";
import {
  createStoreSnapshotFromCopilotRuntimeFeed,
  type CopilotRuntimeFeed
} from "../src/index";

describe("protocol-copilot", () => {
  it("normalizes Copilot runtime data into a store snapshot", () => {
    const feed: CopilotRuntimeFeed = {
      profileName: "Operator",
      sessions: [
        {
          id: "chat-1",
          title: "Explain selected config",
          workspacePath:
            "vscode-remote://wsl%2Bubuntu/mnt/c/Users/xtrem/OneDrive/Documents/codecraft/SubMind",
          storageKey: "workspace-submind",
          source: "workspace",
          createdAt: 1774856904348,
          updatedAt: 1774857543062,
          responderUsername: "GitHub Copilot",
          mode: "agent",
          modelIdentifier: "copilot/auto",
          modelName: "GPT-5.3-Codex",
          latestUserMessage: "Explain the selected config.",
          requests: [
            {
              id: "request-1",
              timestamp: 1774857496782,
              message: "Explain the selected config.",
              response: "This config grants access to the workspace path.",
              command: "explain",
              modelId: "gpt-5.3-codex",
              referencedFiles: [
                "C:/Users/xtrem/OneDrive/Documents/codecraft/SubMind/config.toml"
              ],
              editedFiles: [
                "C:/Users/xtrem/OneDrive/Documents/codecraft/SubMind/config.toml"
              ],
              toolNames: ["apply_patch"]
            }
          ]
        }
      ]
    };

    const snapshot = createStoreSnapshotFromCopilotRuntimeFeed(feed);

    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.threads).toHaveLength(1);
    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.events.some((event) => event.eventType === "copilot_response")).toBe(true);
    expect(snapshot.fileChanges[0]?.fileType).toBe("config");
    expect(snapshot.projects[0]?.workspacePath).toBe(
      "C:/Users/xtrem/OneDrive/Documents/codecraft/SubMind"
    );
  });

  it("matches the same project id as Codex for equivalent workspace paths", () => {
    const copilotSnapshot = createStoreSnapshotFromCopilotRuntimeFeed({
      profileName: "Operator",
      sessions: [
        {
          id: "chat-1",
          title: "Explain selected config",
          workspacePath:
            "vscode-remote://wsl%2Bubuntu/mnt/c/Users/xtrem/OneDrive/Documents/codecraft/SubMind",
          storageKey: "workspace-submind",
          source: "workspace",
          createdAt: 1774856904348,
          updatedAt: 1774857543062,
          responderUsername: "GitHub Copilot",
          mode: "agent",
          modelIdentifier: "copilot/auto",
          modelName: "GPT-5.3-Codex",
          latestUserMessage: "Explain the selected config.",
          requests: [
            {
              id: "request-1",
              timestamp: 1774857496782,
              message: "Explain the selected config.",
              response: "This config grants access to the workspace path.",
              command: "explain",
              modelId: "gpt-5.3-codex",
              referencedFiles: [],
              editedFiles: [],
              toolNames: []
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
          title: "Review config",
          cwd: "C:/Users/xtrem/OneDrive/Documents/codecraft/SubMind",
          createdAt: 1774866000,
          updatedAt: 1774869600,
          gitBranch: "main",
          gitOriginUrl: null,
          firstUserMessage: "Review the current config.",
          descriptorHints: ["typescript", "tauri"]
        }
      ],
      events: [],
      fileChanges: []
    });

    expect(copilotSnapshot.projects[0]?.id).toBe(codexSnapshot.projects[0]?.id);
  });
});
