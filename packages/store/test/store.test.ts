import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { createStoreSnapshotFromCopilotRuntimeFeed } from "../../protocol-copilot/src/index";
import { createStoreSnapshotFromCodexRuntimeFeed } from "../../protocol-codex/src/index";
import { createStoreSnapshotFromHermesRuntimeFeed } from "../../protocol-hermes/src/index";
import { defaultSettingsConfigDraft } from "../../shared-schemas/src/index";
import {
  createSqliteRepository,
  createPreviewStoreSnapshot,
  createPreviewRepository,
  type ActionStateTransitionInput,
  getPrimarySessionTask,
  getPrimarySessionThread,
  getProjectActionItems,
  getProjectGuidanceItems,
  getProjectMemoryItems,
  getProjectSessions,
  mergeStoreSnapshots,
  resolveProjectExternalExport,
  searchProjects,
  syncRuntimeSnapshotIntoDatabase,
  subMindSqliteSchema,
  type SubMindStoreSnapshot
} from "../src/index";

function createSqliteTestAdapter() {
  const database = new DatabaseSync(":memory:");

  const bind = (values?: unknown[]) =>
    values
      ? Object.fromEntries(
          values.map((value, index) => [String(index + 1), value])
        )
      : undefined;

  return {
    select<T>(query: string, bindValues?: unknown[]) {
      const statement = database.prepare(query);
      const bindings = bind(bindValues);

      return Promise.resolve(
        (bindings ? statement.all(bindings) : statement.all()) as T
      );
    },
    execute(query: string, bindValues?: unknown[]) {
      const statement = database.prepare(query);
      const bindings = bind(bindValues);
      const result = bindings ? statement.run(bindings) : statement.run();

      return Promise.resolve({
        rowsAffected: result.changes,
        lastInsertId:
          result.lastInsertRowid === undefined
            ? null
            : Number(result.lastInsertRowid)
      });
    }
  };
}

function createLegacyRuntimeSnapshot(): SubMindStoreSnapshot {
  const profileId = "profile-local-operator";
  const projectId = "project-submind-legacy";
  const sessionId = "session-thread-legacy";
  const threadId = "thread-thread-legacy";
  const taskId = "task-thread-legacy";

  return {
    profiles: [
      {
        kind: "Profile",
        id: profileId,
        displayName: "Operator",
        defaultProjectId: projectId,
        metadata: {
          source: "codex_local",
          threadCount: 1
        },
        createdAt: "2026-03-29T18:00:00.000Z",
        updatedAt: "2026-03-29T18:41:00.000Z"
      }
    ],
    projects: [
      {
        kind: "Project",
        id: projectId,
        profileId,
        name: "SubMind",
        description: "Legacy grouped workspace",
        summary: "Project row from an older runtime identity scheme.",
        workspacePath: "C:/Workspace/SubMind",
        descriptors: ["typescript"],
        createdAt: "2026-03-29T18:00:00.000Z",
        updatedAt: "2026-03-29T18:41:00.000Z"
      }
    ],
    sessions: [
      {
        kind: "Session",
        id: sessionId,
        profileId,
        projectId,
        status: "active",
        summary: "Legacy session",
        startedAt: "2026-03-29T18:00:00.000Z",
        createdAt: "2026-03-29T18:00:00.000Z",
        updatedAt: "2026-03-29T18:41:00.000Z"
      }
    ],
    threads: [
      {
        kind: "Thread",
        id: threadId,
        sessionId,
        projectId,
        title: "Legacy thread",
        status: "open",
        summary: "Legacy thread summary",
        createdAt: "2026-03-29T18:00:00.000Z",
        updatedAt: "2026-03-29T18:41:00.000Z"
      }
    ],
    tasks: [
      {
        kind: "Task",
        id: taskId,
        sessionId,
        threadId,
        projectId,
        title: "Legacy task",
        status: "active",
        priority: "high",
        summary: "Legacy task summary",
        createdAt: "2026-03-29T18:00:00.000Z",
        updatedAt: "2026-03-29T18:41:00.000Z"
      }
    ],
    events: [
      {
        kind: "Event",
        id: "event-legacy",
        projectId,
        sessionId,
        threadId,
        taskId,
        originType: "codex",
        eventType: "thread-opened",
        category: "lifecycle",
        nodeCategory: "anchor",
        timestamp: "2026-03-29T18:41:00.000Z",
        summary: "Legacy thread opened.",
        metadata: {},
        createdAt: "2026-03-29T18:41:00.000Z",
        updatedAt: "2026-03-29T18:41:00.000Z"
      }
    ],
    fileChanges: [],
    memory: [],
    guidance: [],
    actions: []
  };
}

describe("store", () => {
  it("builds a preview snapshot with aligned project, event, and action data", () => {
    const snapshot = createPreviewStoreSnapshot();

    expect(snapshot.projects).toHaveLength(3);
    expect(snapshot.sessions).toHaveLength(3);
    expect(snapshot.projects[0]).not.toHaveProperty("state");
    expect(snapshot.events[0]?.originType).toBeDefined();
    expect(snapshot.actions[0]?.riskLevel).toBeDefined();
  });

  it("exports app state as part of the sqlite schema", () => {
    expect(subMindSqliteSchema).toHaveProperty("appStateTable");
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
    expect(
      getProjectMemoryItems(snapshot, "project-submind")[0]?.sourceFileChangeIds
    ).toContain("change-main");
    expect(getProjectGuidanceItems(snapshot, "project-submind")[0]?.state).toBe(
      "injected"
    );
    expect(
      getProjectGuidanceItems(snapshot, "project-submind")[0]?.policySummary
    ).toContain("Schema");
    expect(getProjectActionItems(snapshot, "project-submind")[0]?.state).toBe(
      "pending"
    );
  });

  it("searches projects and exports a read-only project data package", async () => {
    const snapshot = await createPreviewRepository().getSnapshot();
    const searchResults = searchProjects(snapshot, {
      query: "tauri operator",
      limit: 5
    });
    const projectExport = resolveProjectExternalExport(snapshot, {
      query: "SubMind",
      generatedAt: "2026-03-30T11:00:00.000Z"
    });

    expect(searchResults).toHaveLength(1);
    expect(searchResults[0]?.project.id).toBe("project-submind");
    expect(searchResults[0]?.counts.sessions).toBe(1);
    expect(projectExport?.kind).toBe("ExternalProjectExport");
    expect(projectExport?.access).toEqual({
      mode: "read_only",
      auth: "bearer_token",
      localOnly: true
    });
    expect(projectExport?.project.name).toBe("SubMind");
    expect(projectExport?.sessions[0]?.projectId).toBe("project-submind");
    expect(projectExport?.memory[0]?.summary).toContain("Desktop app must stay thin");
    expect(projectExport?.guidance[0]?.state).toBe("injected");
    expect(projectExport?.actions[0]?.riskLevel).toBe("high");
  });

  it("redacts secrets from project search and external project exports", () => {
    const secret = "sm_TESTTOKENabcdefghijklmnopqrstuvwxyz123456";
    const snapshot = createPreviewStoreSnapshot();
    const secretSnapshot: SubMindStoreSnapshot = {
      ...snapshot,
      projects: snapshot.projects.map((project) =>
        project.id === "project-submind"
          ? {
              ...project,
              summary: `Project summary captured token ${secret}.`
            }
          : project
      ),
      events: snapshot.events.map((event) =>
        event.projectId === "project-submind"
          ? {
              ...event,
              summary: `${event.summary} Bearer ${secret}`,
              metadata: {
                ...event.metadata,
                token: secret
              }
            }
          : event
      )
    };
    const searchResults = searchProjects(secretSnapshot, {
      query: "SubMind",
      limit: 5
    });
    const projectExport = resolveProjectExternalExport(secretSnapshot, {
      query: "SubMind",
      generatedAt: "2026-03-30T11:00:00.000Z"
    });

    expect(JSON.stringify(searchResults)).not.toContain(secret);
    expect(JSON.stringify(projectExport)).not.toContain(secret);
    expect(JSON.stringify(projectExport)).toContain("[redacted:");
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

  it("supports durable memory curation and records a memory history event", async () => {
    const repository = createPreviewRepository(createPreviewStoreSnapshot());

    const memory = await repository.updateMemoryItem({
      memoryId: "memory-submind-architecture",
      summary: "Thin desktop shell boundary",
      content:
        "apps/desktop stays thin while packages own runtime, state, and retained knowledge.",
      status: "active",
      isPinned: true,
      curationState: "edited",
      changeSummary: "Clarified the thin-shell rule after runtime persistence landed.",
      timestamp: "2026-03-30T10:20:00.000Z"
    });
    const history = await repository.getEventHistory({
      memoryItemId: "memory-submind-architecture"
    });

    expect(memory.summary).toBe("Thin desktop shell boundary");
    expect(memory.curationState).toBe("edited");
    expect(memory.isEdited).toBe(true);
    expect(history[0]?.eventType).toBe("memory-curated");
    expect(history[0]?.summary).toContain("Clarified the thin-shell rule");
  });

  it("persists settings config in preview and sqlite repositories", async () => {
    const previewRepository = createPreviewRepository(createPreviewStoreSnapshot());
    const db = createSqliteTestAdapter();
    const sqliteRepository = createSqliteRepository({ db });
    const nextConfig = {
      ...defaultSettingsConfigDraft,
      snapshotRefreshMs: 90_000,
      secretAutoHideMs: 1_000,
      guidanceAggression: "assertive" as const,
      actionRiskThreshold: "medium" as const
    };

    expect(await previewRepository.getSettingsConfig()).toEqual(
      defaultSettingsConfigDraft
    );

    const previewSaved = await previewRepository.updateSettingsConfig(nextConfig);
    const sqliteSaved = await sqliteRepository.updateSettingsConfig(nextConfig);
    const sqliteReloaded = await createSqliteRepository({ db }).getSettingsConfig();

    expect(previewSaved).toMatchObject({
      snapshotRefreshMs: 60_000,
      secretAutoHideMs: 5_000,
      guidanceAggression: "assertive",
      actionRiskThreshold: "medium"
    });
    expect(await previewRepository.getSettingsConfig()).toEqual(previewSaved);
    expect(sqliteSaved).toEqual(previewSaved);
    expect(sqliteReloaded).toEqual(previewSaved);
  });

  it("replaces stale runtime project rows when the runtime snapshot is resynced", async () => {
    const db = createSqliteTestAdapter();
    const repository = createSqliteRepository({ db });
    const currentSnapshot = createStoreSnapshotFromCodexRuntimeFeed({
      profileName: "Operator",
      threads: [
        {
          id: "thread-1",
          title: "Current thread",
          cwd: "C:\\Workspace\\SubMind\\",
          createdAt: 1774866000,
          updatedAt: 1774869600,
          gitBranch: "main",
          gitOriginUrl: null,
          firstUserMessage: "Current runtime thread.",
          descriptorHints: ["typescript", "tauri"]
        }
      ],
      events: [],
      fileChanges: []
    });

    await syncRuntimeSnapshotIntoDatabase(db, createLegacyRuntimeSnapshot());
    await syncRuntimeSnapshotIntoDatabase(db, currentSnapshot);

    const snapshot = await repository.getSnapshot();
    const currentProjectId = currentSnapshot.projects[0]?.id;

    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.projects[0]?.id).toBe(currentProjectId);
    expect(
      snapshot.projects.some((project) => project.id === "project-submind-legacy")
    ).toBe(false);
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.sessions[0]?.projectId).toBe(currentProjectId);
    expect(snapshot.threads[0]?.projectId).toBe(currentProjectId);
  });

  it("merges Codex, Copilot, and Hermes runtime snapshots onto the same project when the workspace matches", () => {
    const codexSnapshot = createStoreSnapshotFromCodexRuntimeFeed({
      profileName: "Operator",
      threads: [
        {
          id: "thread-1",
          title: "Codex review",
          cwd: "C:/Users/xtrem/OneDrive/Documents/codecraft/SubMind",
          createdAt: 1774866000,
          updatedAt: 1774869600,
          gitBranch: "main",
          gitOriginUrl: null,
          firstUserMessage: "Review the config.",
          descriptorHints: ["typescript", "tauri"]
        }
      ],
      events: [],
      fileChanges: []
    });
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

    const merged = mergeStoreSnapshots([
      codexSnapshot,
      copilotSnapshot,
      hermesSnapshot
    ]);

    expect(merged.projects).toHaveLength(1);
    expect(merged.sessions).toHaveLength(3);
    expect(new Set(merged.sessions.map((session) => session.projectId))).toEqual(
      new Set([merged.projects[0]!.id])
    );
    expect(merged.projects[0]?.descriptors).toEqual(
      expect.arrayContaining(["typescript", "tauri", "vscode", "copilot", "hermes"])
    );
  });
});
