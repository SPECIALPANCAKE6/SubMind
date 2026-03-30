import { describe, expect, it } from "vitest";

import {
  createPreviewStoreSnapshot,
  createPreviewRepository,
  getPrimarySessionTask,
  getPrimarySessionThread,
  getProjectActionItems,
  getProjectGuidanceItems,
  getProjectMemoryItems,
  getProjectSessions
} from "../src/index";

describe("store", () => {
  it("builds a preview snapshot with aligned project, event, and action data", () => {
    const snapshot = createPreviewStoreSnapshot();

    expect(snapshot.projects).toHaveLength(3);
    expect(snapshot.sessions).toHaveLength(3);
    expect(snapshot.projects[0]).not.toHaveProperty("state");
    expect(snapshot.events[0]?.originType).toBeDefined();
    expect(snapshot.actions[0]?.riskLevel).toBeDefined();
  });

  it("sorts project sessions and resolves primary thread and task", () => {
    const snapshot = createPreviewStoreSnapshot();
    const sessions = getProjectSessions(snapshot, "project-submind");
    const primaryThread = getPrimarySessionThread(
      snapshot,
      "session-submind-current"
    );
    const primaryTask = getPrimarySessionTask(
      snapshot,
      "session-submind-current"
    );

    expect(sessions[0]?.id).toBe("session-submind-current");
    expect(primaryThread?.title).toBe("Stack migration and shell reshape");
    expect(primaryTask?.status).toBe("active");
  });

  it("exposes memory, guidance, and action collections for active projects", async () => {
    const snapshot = await createPreviewRepository().getSnapshot();

    expect(getProjectMemoryItems(snapshot, "project-submind")[0]?.summary).toContain(
      "Desktop app must stay thin"
    );
    expect(getProjectGuidanceItems(snapshot, "project-submind")[0]?.state).toBe(
      "injected"
    );
    expect(getProjectActionItems(snapshot, "project-submind")[0]?.state).toBe(
      "pending"
    );
  });
});
