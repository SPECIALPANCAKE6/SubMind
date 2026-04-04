import { describe, expect, it } from "vitest";

import {
  createPreviewStoreSnapshot,
  createPreviewRepository,
  type ActionStateTransitionInput,
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

  it("records action state transitions with updated action state and history events", async () => {
    const repository = createPreviewRepository();
    const transition: ActionStateTransitionInput = {
      actionId: "action-submind-schema",
      nextState: "approved",
      actualOutcome: "Schema contracts aligned on the persisted store path.",
      actor: "operator",
      timestamp: "2026-03-30T10:05:00.000Z"
    };

    const action = await repository.transitionAction(transition);
    const snapshot = await repository.getSnapshot();
    const transitionEvent = snapshot.events.find(
      (event) => event.actionItemId === transition.actionId
    );

    expect(action.state).toBe("approved");
    expect(action.actualOutcome).toContain("persisted store path");
    expect(snapshot.actions.find((item) => item.id === transition.actionId)?.state).toBe(
      "approved"
    );
    expect(transitionEvent?.eventType).toBe("action-state-transition");
    expect(transitionEvent?.summary).toContain("moved from pending to approved");
  });

  it("supports explicit event, file-change, and action history queries", async () => {
    const repository = createPreviewRepository(createPreviewStoreSnapshot());

    const projectEvents = await repository.getEventHistory({
      projectId: "project-submind",
      limit: 2
    });
    const threadFileChanges = await repository.getFileChangeHistory({
      threadId: "thread-submind-migration"
    });
    const actionHistoryBefore = await repository.getActionHistory(
      "action-submind-schema"
    );

    await repository.transitionAction({
      actionId: "action-submind-schema",
      nextState: "resolved",
      actualOutcome: "Schema realignment landed cleanly.",
      timestamp: "2026-03-30T10:10:00.000Z"
    });

    const actionHistoryAfter = await repository.getActionHistory(
      "action-submind-schema"
    );

    expect(projectEvents).toHaveLength(2);
    expect(projectEvents[0]?.projectId).toBe("project-submind");
    expect(threadFileChanges).toHaveLength(2);
    expect(threadFileChanges.every((item) => item.threadId === "thread-submind-migration")).toBe(true);
    expect(actionHistoryBefore).toHaveLength(0);
    expect(actionHistoryAfter[0]?.eventType).toBe("action-state-transition");
    expect(actionHistoryAfter[0]?.actionItemId).toBe("action-submind-schema");
  });
});
