import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { createStoreSnapshotFromCopilotRuntimeFeed } from "../../protocol-copilot/src/index";
import { createStoreSnapshotFromCodexRuntimeFeed } from "../../protocol-codex/src/index";
import { createStoreSnapshotFromHermesRuntimeFeed } from "../../protocol-hermes/src/index";
import {
  currentSettingsConfigVersion,
  defaultSettingsConfigDraft,
  settingsConfigStorageKey,
  updateSettingsConfigValue
} from "../../shared-schemas/src/index";
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

  it("appends redacted, idempotent model-worker audit events", async () => {
    const snapshot = createPreviewStoreSnapshot();
    const event = {
      kind: "Event" as const,
      id: "event-model-checkpoint-test",
      createdAt: "2026-03-30T10:30:00.000Z",
      updatedAt: "2026-03-30T10:30:00.000Z",
      projectId: "project-submind",
      originType: "submind" as const,
      eventType: "model-checkpoint-run",
      category: "system_user" as const,
      nodeCategory: "marker" as const,
      timestamp: "2026-03-30T10:30:00.000Z",
      summary: "Model checkpoint completed.",
      metadata: { generated: "credential=sm_abcdefghijklmnopqrstuvwxyz0123456789" }
    };
    const previewRepository = createPreviewRepository(snapshot);
    const db = createSqliteTestAdapter();
    const sqliteRepository = createSqliteRepository({
      db,
      seedSnapshot: snapshot
    });

    await previewRepository.appendEvents([event]);
    await sqliteRepository.appendEvents([event, event]);
    const previewHistory = await previewRepository.getEventHistory({
      projectId: "project-submind"
    });
    const sqliteHistory = await createSqliteRepository({ db }).getEventHistory({
      projectId: "project-submind"
    });
    const previewEvent = previewHistory.find((item) => item.id === event.id);
    const sqliteEvent = sqliteHistory.find((item) => item.id === event.id);

    expect(previewEvent?.metadata.generated).not.toContain("sm_abcdefghijklmnopqrstuvwxyz");
    expect(sqliteEvent?.metadata.generated).not.toContain("sm_abcdefghijklmnopqrstuvwxyz");
    expect(sqliteHistory.filter((item) => item.id === event.id)).toHaveLength(1);
  });

  it("persists generated memories and guidance only as reviewable proposals", async () => {
    const snapshot = createPreviewStoreSnapshot();
    const sourceEvent = snapshot.events.find(
      (item) => item.projectId === "project-submind"
    )!;
    const scope = {
      ...(sourceEvent.sessionId ? { sessionId: sourceEvent.sessionId } : {}),
      ...(sourceEvent.threadId ? { threadId: sourceEvent.threadId } : {})
    };
    const memory = {
      kind: "MemoryItem" as const,
      id: "memory-model-reviewable-test",
      projectId: sourceEvent.projectId,
      ...scope,
      bucket: "architecture_notes" as const,
      status: "draft" as const,
      summary: "Generated memory awaiting review",
      content: "A source-backed fact generated for operator review.",
      confidence: 0.88,
      freshness: 1,
      curationState: "derived" as const,
      sourceEventIds: [sourceEvent.id],
      sourceFileChangeIds: [],
      linkedActionItemIds: [],
      linkedGuidanceItemIds: [],
      changeSummary: "Generated for operator review.",
      isPinned: false,
      isEdited: false,
      contextEligible: false,
      createdAt: "2026-03-30T10:40:00.000Z",
      updatedAt: "2026-03-30T10:40:00.000Z"
    };
    const guidance = {
      kind: "GuidanceItem" as const,
      id: "guidance-model-reviewable-test",
      projectId: sourceEvent.projectId,
      ...scope,
      title: "Generated guidance awaiting review",
      summary: "A candidate intervention.",
      rationale: "The source evidence supports this recommendation.",
      state: "candidate" as const,
      source: "model" as const,
      confidence: 0.83,
      evidenceSummary: "One linked source event.",
      policySummary: "Requires operator review before injection.",
      linkedMemoryItemIds: [memory.id],
      linkedEventIds: [sourceEvent.id],
      linkedActionItemIds: [],
      contextEligible: false,
      createdAt: "2026-03-30T10:40:00.000Z",
      updatedAt: "2026-03-30T10:40:00.000Z"
    };
    const task = {
      kind: "Task" as const,
      id: "task-model-reviewable-test",
      projectId: sourceEvent.projectId,
      sessionId: sourceEvent.sessionId!,
      threadId: sourceEvent.threadId!,
      title: "Move inventory reads to the shared store",
      summary: "Use the canonical inventory repository.",
      status: "proposed" as const,
      suggestedStatus: "active" as const,
      priority: "high" as const,
      source: "model" as const,
      sourceEventIds: [sourceEvent.id],
      contextEligible: false,
      createdAt: "2026-03-30T10:40:00.000Z",
      updatedAt: "2026-03-30T10:40:00.000Z"
    };
    const batch = { tasks: [task], memory: [memory], guidance: [guidance] };
    const previewRepository = createPreviewRepository(snapshot);
    const db = createSqliteTestAdapter();
    const sqliteRepository = createSqliteRepository({ db, seedSnapshot: snapshot });

    await previewRepository.appendGeneratedProposals(batch);
    await sqliteRepository.appendGeneratedProposals(batch);
    await sqliteRepository.appendGeneratedProposals(batch);

    for (const repository of [
      previewRepository,
      createSqliteRepository({ db })
    ]) {
      const current = await repository.getSnapshot();
      expect(current.memory.find((item) => item.id === memory.id)?.status).toBe("draft");
      expect(current.guidance.find((item) => item.id === guidance.id)).toMatchObject({
        state: "candidate",
        source: "model"
      });
      expect(current.memory.filter((item) => item.id === memory.id)).toHaveLength(1);
      expect(current.guidance.filter((item) => item.id === guidance.id)).toHaveLength(1);
      expect(current.tasks.find((item) => item.id === task.id)).toMatchObject({
        status: "proposed",
        source: "model",
        sourceEventIds: [sourceEvent.id]
      });
      const acceptedGuidance = await repository.reviewGuidanceItem({
        guidanceId: guidance.id,
        nextState: "suggested",
        timestamp: "2026-03-30T10:41:00.000Z"
      });
      const acceptedTask = await repository.reviewTask({
        taskId: task.id,
        decision: "accept",
        timestamp: "2026-03-30T10:42:00.000Z"
      });
      expect(acceptedGuidance.state).toBe("suggested");
      expect(acceptedTask.status).toBe("active");
      expect(
        (await repository.getEventHistory({ guidanceItemId: guidance.id }))[0]
          ?.eventType
      ).toBe("guidance-review");
      expect(
        (await repository.getEventHistory({ taskId: task.id }))[0]?.eventType
      ).toBe("task-review");

      const guidanceReview = (await repository.getEventHistory({
        guidanceItemId: guidance.id
      })).find((event) => event.eventType === "guidance-review")!;
      const taskReview = (await repository.getEventHistory({
        taskId: task.id
      })).find((event) => event.eventType === "task-review")!;
      await repository.revertProposalReview({
        eventId: guidanceReview.id,
        timestamp: "2026-03-30T10:42:00.000Z"
      });
      await repository.revertProposalReview({
        eventId: taskReview.id,
        timestamp: "2026-03-30T10:42:30.000Z"
      });
      expect(
        (await repository.getSnapshot()).guidance.find((item) => item.id === guidance.id)
          ?.state
      ).toBe("candidate");
      expect(
        (await repository.getSnapshot()).tasks.find((item) => item.id === task.id)
          ?.status
      ).toBe("proposed");

      await repository.reviewGuidanceItem({
        guidanceId: guidance.id,
        nextState: "suggested",
        timestamp: "2026-03-30T10:43:00.000Z"
      });
      await repository.reviewTask({
        taskId: task.id,
        decision: "accept",
        timestamp: "2026-03-30T10:44:00.000Z"
      });
      await repository.setContextEligibility({
        entityKind: "GuidanceItem",
        entityId: guidance.id,
        isEligible: true,
        timestamp: "2026-03-30T10:45:00.000Z"
      });
      await repository.setContextEligibility({
        entityKind: "Task",
        entityId: task.id,
        isEligible: true,
        timestamp: "2026-03-30T10:46:00.000Z"
      });
      await expect(
        repository.revertProposalReview({
          eventId: (await repository.getEventHistory({
            guidanceItemId: guidance.id
          })).find((event) => event.eventType === "guidance-review")!.id,
          timestamp: "2026-03-30T10:46:30.000Z"
        })
      ).rejects.toThrow("changed after that review");
      const eligibleSnapshot = await repository.getSnapshot();
      expect(
        eligibleSnapshot.guidance.find((item) => item.id === guidance.id)
          ?.contextEligible
      ).toBe(true);
      expect(
        eligibleSnapshot.tasks.find((item) => item.id === task.id)
          ?.contextEligible
      ).toBe(true);

      await expect(
        repository.setContextEligibility({
          entityKind: "GuidanceItem",
          entityId: guidance.id,
          isEligible: false,
          timestamp: "2026-03-30T10:47:00.000Z"
        })
      ).resolves.toBeUndefined();

      await repository.updateMemoryItem({
        memoryId: memory.id,
        summary: "Confirmed memory text",
        content: "The operator accepted this retained fact.",
        status: "active",
        isPinned: false,
        curationState: "confirmed",
        timestamp: "2026-03-30T10:48:00.000Z"
      });
      const memoryCuration = (await repository.getEventHistory({
        memoryItemId: memory.id
      })).find((event) => event.eventType === "memory-curated")!;
      await repository.revertProposalReview({
        eventId: memoryCuration.id,
        timestamp: "2026-03-30T10:49:00.000Z"
      });
      expect(
        (await repository.getSnapshot()).memory.find((item) => item.id === memory.id)
      ).toMatchObject({
        status: "draft",
        summary: "Generated memory awaiting review",
        contextEligible: false
      });
    }
  });

  it("migrates existing task tables to retain proposal semantics and evidence", async () => {
    const db = createSqliteTestAdapter();
    await db.execute(`CREATE TABLE tasks (
      id TEXT PRIMARY KEY NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      session_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      summary TEXT
    )`);
    const repository = createSqliteRepository({ db });
    await repository.getSnapshot();

    const columns = await db.select<Array<{ name: string }>>(
      "PRAGMA table_info(tasks)"
    );
    expect(columns.map((column) => column.name)).toContain("suggested_status");
    expect(columns.map((column) => column.name)).toContain("source");
    expect(columns.map((column) => column.name)).toContain(
      "source_event_ids_json"
    );
    expect(columns.map((column) => column.name)).toContain("context_eligible");
  });

  it("persists settings config in preview and sqlite repositories", async () => {
    const previewRepository = createPreviewRepository(createPreviewStoreSnapshot());
    const db = createSqliteTestAdapter();
    const sqliteRepository = createSqliteRepository({ db });
    const nextConfig = updateSettingsConfigValue(
      updateSettingsConfigValue(
        updateSettingsConfigValue(
          updateSettingsConfigValue(
            defaultSettingsConfigDraft,
            "snapshotRefreshMs",
            90_000
          ),
          "secretAutoHideMs",
          1_000
        ),
        "guidanceAggression",
        "assertive",
        { projectId: "project-submind" }
      ),
      "actionRiskThreshold",
      "medium",
      { projectId: "project-submind" }
    );

    expect(await previewRepository.getSettingsConfig()).toEqual(
      defaultSettingsConfigDraft
    );

    const previewSaved = await previewRepository.updateSettingsConfig(nextConfig);
    const sqliteSaved = await sqliteRepository.updateSettingsConfig(nextConfig);
    const sqliteReloaded = await createSqliteRepository({ db }).getSettingsConfig();
    const storedRows = await db.select<Array<{ value: string }>>(
      "SELECT value FROM app_state WHERE key = $1",
      [settingsConfigStorageKey]
    );
    const storedConfig = JSON.parse(storedRows[0]?.value ?? "{}") as Record<
      string,
      unknown
    >;

    expect(previewSaved).toMatchObject({
      version: currentSettingsConfigVersion,
      app: {
        snapshotRefreshMs: 60_000
      },
      profile: {
        secretAutoHideMs: 5_000
      },
      projectOverrides: {
        "project-submind": {
          scope: "project",
          guidanceAggression: "assertive",
          actionRiskThreshold: "medium"
        }
      }
    });
    expect(storedConfig.version).toBe(currentSettingsConfigVersion);
    expect(storedConfig.projectOverrides).toMatchObject({
      "project-submind": {
        guidanceAggression: "assertive"
      }
    });
    expect(await previewRepository.getSettingsConfig()).toEqual(previewSaved);
    expect(sqliteSaved).toEqual(previewSaved);
    expect(sqliteReloaded).toEqual(previewSaved);
  });

  it("persists explicit remote workspace aliases on projects", async () => {
    const db = createSqliteTestAdapter();
    const repository = createSqliteRepository({
      db,
      seedSnapshot: createPreviewStoreSnapshot()
    });

    await repository.updateProjectWorkspaceAliases({
      projectId: "project-submind",
      workspaceAliases: [
        "vscode-remote://ssh-remote%2Bbuildbox/home/xtrem/codecraft/SubMind",
        "C:\\Workspace\\SubMind\\",
        "C:/Workspace/SubMind"
      ],
      timestamp: "2026-03-30T11:00:00.000Z"
    });

    const reloaded = await createSqliteRepository({ db }).getSnapshot();
    expect(reloaded.projects.find((project) => project.id === "project-submind"))
      .toMatchObject({
        workspaceAliases: [
          "//vscode-remote/ssh-remote+buildbox/home/xtrem/codecraft/SubMind"
        ],
        updatedAt: "2026-03-30T11:00:00.000Z"
      });
  });

  it("reconciles runtime project aliases while retaining prior sessions and evidence", async () => {
    const db = createSqliteTestAdapter();
    const legacySnapshot = createLegacyRuntimeSnapshot();
    legacySnapshot.actions = [
      {
        kind: "ActionItem",
        id: "action-legacy-project-review",
        projectId: "project-submind-legacy",
        sessionId: "session-thread-legacy",
        threadId: "thread-thread-legacy",
        title: "Review legacy project identity",
        summary: "Keep the retained action attached during identity migration.",
        state: "pending",
        riskLevel: "medium",
        riskSummary: "The action could be orphaned by a project ID replacement.",
        riskFactors: ["legacy project id"],
        expectedOutcome: "The action follows the canonical project.",
        owner: "operator",
        createdAt: "2026-03-29T18:30:00.000Z",
        updatedAt: "2026-03-29T18:41:00.000Z"
      }
    ];
    legacySnapshot.memory = [
      {
        kind: "MemoryItem",
        id: "memory-runtime-project-context-project-submind-legacy",
        projectId: "project-submind-legacy",
        bucket: "project_context",
        status: "active",
        summary: "Legacy SubMind context",
        content: "Context retained under the legacy project identity.",
        confidence: 0.9,
        freshness: 0.9,
        curationState: "derived",
        sourceEventIds: ["event-legacy"],
        sourceFileChangeIds: [],
        linkedActionItemIds: ["action-legacy-project-review"],
        linkedGuidanceItemIds: [],
        isPinned: false,
        isEdited: false,
        createdAt: "2026-03-29T18:00:00.000Z",
        updatedAt: "2026-03-29T18:41:00.000Z"
      }
    ];
    const repository = createSqliteRepository({ db, seedSnapshot: legacySnapshot });
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

    const legacyStoredSnapshot = await repository.getSnapshot();
    await db.execute(
      `INSERT INTO app_state (key, value) VALUES ($1, $2)`,
      ["runtime_source", "codex_local_v1"]
    );
    const legacyProjectMemory = legacyStoredSnapshot.memory.find(
      (item) =>
        item.id ===
        "memory-runtime-project-context-project-submind-legacy"
    );

    expect(legacyProjectMemory).toBeDefined();
    await repository.updateMemoryItem({
      memoryId: legacyProjectMemory!.id,
      summary: "Edited SubMind identity context",
      content: "Operator-curated context must survive project reconciliation.",
      status: "active",
      isPinned: true,
      curationState: "edited",
      changeSummary: "Preserve this edit across the identity migration.",
      timestamp: "2026-03-29T19:00:00.000Z"
    });
    await repository.updateSettingsConfig(
      updateSettingsConfigValue(
        defaultSettingsConfigDraft,
        "guidanceAggression",
        "assertive",
        { projectId: "project-submind-legacy" }
      )
    );
    await syncRuntimeSnapshotIntoDatabase(db, currentSnapshot);

    const snapshot = await repository.getSnapshot();
    const currentProjectId = currentSnapshot.projects[0]?.id;
    const settings = await repository.getSettingsConfig();
    const runtimeSourceRows = await db.select<Array<{ value: string }>>(
      "SELECT value FROM app_state WHERE key = $1",
      ["runtime_source"]
    );

    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.projects[0]?.id).toBe(currentProjectId);
    expect(
      snapshot.projects.some((project) => project.id === "project-submind-legacy")
    ).toBe(false);
    expect(snapshot.sessions).toHaveLength(2);
    expect(snapshot.events.some(event => event.id === "event-legacy")).toBe(true);
    expect(snapshot.sessions.every(session => session.projectId === currentProjectId)).toBe(true);
    expect(snapshot.threads[0]?.projectId).toBe(currentProjectId);
    expect(snapshot.actions).toHaveLength(1);
    expect(snapshot.actions[0]?.projectId).toBe(currentProjectId);
    expect(
      snapshot.memory.find(
        (item) => item.id === `memory-runtime-project-context-${currentProjectId}`
      )
    ).toMatchObject({
      projectId: currentProjectId,
      summary: "Edited SubMind identity context",
      content: "Operator-curated context must survive project reconciliation.",
      isEdited: true,
      isPinned: true
    });
    expect(settings.projectOverrides["project-submind-legacy"]).toBeUndefined();
    expect(settings.projectOverrides[currentProjectId!]).toMatchObject({
      projectId: currentProjectId,
      guidanceAggression: "assertive"
    });
    expect(runtimeSourceRows[0]?.value).toBe("runtime_source");
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

  it("reconciles equivalent workspace paths even when sources supplied different project ids", () => {
    const codexSnapshot = createStoreSnapshotFromCodexRuntimeFeed({
      profileName: "Operator",
      threads: [
        {
          id: "codex-path-alias",
          title: "Native workspace",
          cwd: "C:\\Users\\xtrem\\OneDrive\\Documents\\codecraft\\SubMind",
          createdAt: 1774866000,
          updatedAt: 1774869600,
          gitBranch: "main",
          gitOriginUrl: null,
          firstUserMessage: "Inspect native workspace identity.",
          descriptorHints: []
        }
      ],
      events: [],
      fileChanges: []
    });
    const copilotSnapshot = createStoreSnapshotFromCopilotRuntimeFeed({
      profileName: "Operator",
      sessions: [
        {
          id: "copilot-path-alias",
          title: "Remote workspace",
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
          latestUserMessage: "Inspect remote workspace identity.",
          requests: [
            {
              id: "copilot-path-request",
              timestamp: 1774857496782,
              message: "Inspect remote workspace identity.",
              response: "The remote locator points at the native workspace.",
              command: null,
              modelId: "gpt-5.3-codex",
              referencedFiles: [],
              editedFiles: [],
              toolNames: []
            }
          ]
        }
      ]
    });
    const staleCopilotProjectId = "project-copilot-stale-path-format";
    copilotSnapshot.projects[0]!.id = staleCopilotProjectId;
    copilotSnapshot.sessions[0]!.projectId = staleCopilotProjectId;
    copilotSnapshot.threads[0]!.projectId = staleCopilotProjectId;
    copilotSnapshot.memory = [
      {
        kind: "MemoryItem",
        id: `memory-runtime-project-context-${staleCopilotProjectId}`,
        projectId: staleCopilotProjectId,
        bucket: "project_context",
        status: "active",
        summary: "Copilot project context",
        content: "Retained project context from the Copilot identity.",
        confidence: 0.9,
        freshness: 0.9,
        curationState: "edited",
        sourceEventIds: [],
        sourceFileChangeIds: [],
        linkedActionItemIds: [],
        linkedGuidanceItemIds: ["guidance-copilot-path"],
        isPinned: true,
        isEdited: true,
        createdAt: "2026-03-29T18:00:00.000Z",
        updatedAt: "2026-03-29T18:41:00.000Z"
      }
    ];
    copilotSnapshot.guidance = [
      {
        kind: "GuidanceItem",
        id: "guidance-copilot-path",
        projectId: staleCopilotProjectId,
        title: "Keep project identity unified",
        summary: "Use the canonical workspace anchor.",
        rationale: "Equivalent locators describe the same workspace.",
        state: "injected",
        source: "policy",
        confidence: 0.95,
        evidenceSummary: "Codex and Copilot paths normalize equally.",
        policySummary: "Canonical workspace identity wins.",
        linkedMemoryItemIds: [
          `memory-runtime-project-context-${staleCopilotProjectId}`
        ],
        linkedEventIds: [],
        linkedActionItemIds: [],
        createdAt: "2026-03-29T18:00:00.000Z",
        updatedAt: "2026-03-29T18:41:00.000Z"
      }
    ];

    const merged = mergeStoreSnapshots([codexSnapshot, copilotSnapshot]);
    const canonicalProjectId = codexSnapshot.projects[0]!.id;

    expect(merged.projects).toHaveLength(1);
    expect(merged.projects[0]?.id).toBe(canonicalProjectId);
    expect(new Set(merged.sessions.map((session) => session.projectId))).toEqual(
      new Set([canonicalProjectId])
    );
    expect(new Set(merged.threads.map((thread) => thread.projectId))).toEqual(
      new Set([canonicalProjectId])
    );
    expect(merged.memory[0]).toMatchObject({
      id: `memory-runtime-project-context-${canonicalProjectId}`,
      projectId: canonicalProjectId
    });
    expect(merged.guidance[0]).toMatchObject({
      projectId: canonicalProjectId,
      linkedMemoryItemIds: [
        `memory-runtime-project-context-${canonicalProjectId}`
      ]
    });
  });

  it("unifies every root represented by a multi-root Copilot workspace", () => {
    const codexRootOne = createStoreSnapshotFromCodexRuntimeFeed({
      profileName: "Operator",
      threads: [
        {
          id: "codex-root-one",
          title: "Work in app root",
          cwd: "C:/Workspace/SubMind/app",
          createdAt: 1774866000,
          updatedAt: 1774869600,
          gitBranch: "main",
          gitOriginUrl: null,
          firstUserMessage: "Inspect app root.",
          descriptorHints: []
        }
      ],
      events: [],
      fileChanges: []
    });
    const codexRootTwo = createStoreSnapshotFromCodexRuntimeFeed({
      profileName: "Operator",
      threads: [
        {
          id: "codex-root-two",
          title: "Work in services root",
          cwd: "C:/Workspace/SubMind/services",
          createdAt: 1774866000,
          updatedAt: 1774869700,
          gitBranch: "main",
          gitOriginUrl: null,
          firstUserMessage: "Inspect services root.",
          descriptorHints: []
        }
      ],
      events: [],
      fileChanges: []
    });
    const copilotWorkspace = createStoreSnapshotFromCopilotRuntimeFeed({
      profileName: "Operator",
      sessions: [
        {
          id: "copilot-multi-root",
          title: "Review full workspace",
          workspacePath: "file:///C:/Workspace/SubMind/SubMind.code-workspace",
          workspaceAliases: [
            "file:///C:/Workspace/SubMind/app",
            "file:///C:/Workspace/SubMind/services"
          ],
          storageKey: "workspace-submind-multi-root",
          source: "workspace",
          createdAt: 1774856904348,
          updatedAt: 1774857543062,
          responderUsername: "GitHub Copilot",
          mode: "agent",
          modelIdentifier: "copilot/auto",
          modelName: "GPT-5.3-Codex",
          latestUserMessage: "Review both workspace roots.",
          requests: [
            {
              id: "multi-root-request",
              timestamp: 1774857496782,
              message: "Review both workspace roots.",
              response: "Both roots belong to this workspace.",
              command: null,
              modelId: "gpt-5.3-codex",
              referencedFiles: [],
              editedFiles: [],
              toolNames: []
            }
          ]
        }
      ]
    });

    const merged = mergeStoreSnapshots([
      codexRootOne,
      codexRootTwo,
      copilotWorkspace
    ]);

    expect(merged.projects).toHaveLength(1);
    expect(merged.projects[0]).toMatchObject({
      workspacePath: "C:/Workspace/SubMind/SubMind.code-workspace",
      workspaceAliases: [
        "C:/Workspace/SubMind/app",
        "C:/Workspace/SubMind/services"
      ]
    });
    expect(new Set(merged.sessions.map((session) => session.projectId))).toEqual(
      new Set([merged.projects[0]!.id])
    );
  });

  it("requires an explicit alias before linking a remote host to a local path", () => {
    const localSnapshot = createStoreSnapshotFromCodexRuntimeFeed({
      profileName: "Operator",
      threads: [
        {
          id: "codex-local-linux",
          title: "Local Linux work",
          cwd: "/home/xtrem/codecraft/SubMind",
          createdAt: 1774866000,
          updatedAt: 1774869600,
          gitBranch: "main",
          gitOriginUrl: null,
          firstUserMessage: "Inspect the local checkout.",
          descriptorHints: []
        }
      ],
      events: [],
      fileChanges: []
    });
    const remoteSnapshot = createStoreSnapshotFromCopilotRuntimeFeed({
      profileName: "Operator",
      sessions: [
        {
          id: "copilot-buildbox",
          title: "Remote buildbox work",
          workspacePath:
            "vscode-remote://ssh-remote%2Bbuildbox/home/xtrem/codecraft/SubMind",
          storageKey: "workspace-buildbox-submind",
          source: "workspace",
          createdAt: 1774856904348,
          updatedAt: 1774857543062,
          responderUsername: "GitHub Copilot",
          mode: "agent",
          modelIdentifier: "copilot/auto",
          modelName: "GPT-5.3-Codex",
          latestUserMessage: "Inspect the remote checkout.",
          requests: [
            {
              id: "remote-request",
              timestamp: 1774857496782,
              message: "Inspect the remote checkout.",
              response: "This checkout is on buildbox.",
              command: null,
              modelId: "gpt-5.3-codex",
              referencedFiles: [],
              editedFiles: [],
              toolNames: []
            }
          ]
        }
      ]
    });

    expect(mergeStoreSnapshots([localSnapshot, remoteSnapshot]).projects).toHaveLength(2);

    remoteSnapshot.projects[0]!.workspaceAliases = [
      "/home/xtrem/codecraft/SubMind"
    ];
    const explicitlyLinked = mergeStoreSnapshots([localSnapshot, remoteSnapshot]);

    expect(explicitlyLinked.projects).toHaveLength(1);
    expect(explicitlyLinked.projects[0]?.workspaceAliases).toEqual([
      "/home/xtrem/codecraft/SubMind"
    ]);
  });
});
