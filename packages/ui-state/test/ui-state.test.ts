import { describe, expect, it } from "vitest";

import {
  createPreviewRepository,
  createPreviewStoreSnapshot
} from "../../store/src/index";
import {
  clearFocusedShellProject,
  clearShellProjectSelection,
  createInitialShellUiState,
  createShellViewModel,
  focusSelectedShellProject,
  getProjectCardState,
  getShellScope,
  revealShellSecretTarget,
  selectShellAction,
  selectShellGuidance,
  selectShellMemory,
  selectShellProject,
  selectShellSession,
  selectShellThread,
  setShellProjectSearchQuery,
  setShellPrimaryScreen,
  toggleShellProjectFocus
} from "../src/index";

describe("ui-state", () => {
  it("starts in global scope with the default project selected", () => {
    const snapshot = createPreviewStoreSnapshot();
    const state = createInitialShellUiState(snapshot);

    expect(state.layoutMode).toBe("operator");
    expect(state.primaryScreen).toBe("dashboard");
    expect(state.selectedProjectId).toBe("project-submind");
    expect(getShellScope(state)).toBe("global");
    expect(getProjectCardState(state, "project-submind")).toBe("selected");
  });

  it("supports select, clear, focus, unfocus, and repeat-click deactivation", () => {
    const snapshot = createPreviewStoreSnapshot();
    const initial = createInitialShellUiState(snapshot);
    const atlasSelected = selectShellProject(initial, "project-atlas");
    const atlasCleared = selectShellProject(atlasSelected, "project-atlas");
    const ledgerFocused = toggleShellProjectFocus(initial, "project-ledger");
    const ledgerUnfocused = toggleShellProjectFocus(ledgerFocused, "project-ledger");
    const focusedSelected = focusSelectedShellProject(atlasSelected);
    const clearedFocus = clearFocusedShellProject(focusedSelected);
    const clearedSelection = clearShellProjectSelection(clearedFocus);

    expect(atlasSelected.selectedProjectId).toBe("project-atlas");
    expect(atlasCleared.selectedProjectId).toBeNull();
    expect(ledgerFocused.focusedProjectId).toBe("project-ledger");
    expect(ledgerUnfocused.focusedProjectId).toBeNull();
    expect(ledgerUnfocused.selectedProjectId).toBe("project-ledger");
    expect(focusedSelected.focusedProjectId).toBe("project-atlas");
    expect(clearedFocus.selectedProjectId).toBe("project-atlas");
    expect(clearedFocus.focusedProjectId).toBeNull();
    expect(clearedSelection.selectedProjectId).toBeNull();
  });

  it("filters the project stack by project search without changing scope", () => {
    const snapshot = createPreviewStoreSnapshot();
    const state = setShellProjectSearchQuery(
      createInitialShellUiState(snapshot),
      "ledger"
    );
    const viewModel = createShellViewModel(snapshot, state);

    expect(viewModel.scope).toBe("global");
    expect(viewModel.activeProject?.id).toBe("project-submind");
    expect(viewModel.projectStack.search.isFiltering).toBe(true);
    expect(viewModel.projectStack.search.resultLabel).toBe("1 of 3 project");
    expect(viewModel.projectStack.cards).toHaveLength(1);
    expect(viewModel.projectStack.cards[0]?.name).toBe("Memory Ledger");
  });

  it("tracks screen and detail selections across sessions, memory, guidance, and actions", () => {
    const snapshot = createPreviewStoreSnapshot();
    const base = createInitialShellUiState(snapshot);
    const sessions = selectShellSession(base, "session-submind-current");
    const thread = selectShellThread(sessions, "thread-submind-migration");
    const memory = selectShellMemory(sessions, "memory-submind-architecture");
    const guidance = selectShellGuidance(memory, "guidance-submind-stack");
    const actions = selectShellAction(guidance, "action-submind-schema");
    const screen = setShellPrimaryScreen(actions, "actions");

    expect(screen.activeSessionId).toBe("session-submind-current");
    expect(thread.activeThreadId).toBe("thread-submind-migration");
    expect(screen.activeMemoryId).toBe("memory-submind-architecture");
    expect(screen.activeGuidanceId).toBe("guidance-submind-stack");
    expect(screen.activeActionId).toBe("action-submind-schema");
    expect(screen.primaryScreen).toBe("actions");
  });

  it("derives primary screen content around the active scope", () => {
    const snapshot = createPreviewStoreSnapshot();
    const state = setShellPrimaryScreen(
      toggleShellProjectFocus(
        selectShellAction(
          selectShellGuidance(
            selectShellMemory(
              selectShellSession(
                createInitialShellUiState(snapshot),
                "session-submind-current"
              ),
              "memory-submind-architecture"
            ),
            "guidance-submind-stack"
          ),
          "action-submind-schema"
        ),
        "project-submind"
      ),
      "actions"
    );
    const viewModel = createShellViewModel(snapshot, state);

    expect(viewModel.scope).toBe("project");
    expect(viewModel.activeProject?.name).toBe("SubMind");
    expect(viewModel.contentHeader.title).toBe("Actions");
    expect(viewModel.projectStack.focusedContextCards).toHaveLength(2);
    expect(viewModel.sessions.sessions[0]?.title).toContain("Stack migration");
    expect(viewModel.memory.cards[0]?.summary).toContain("Desktop app must stay thin");
    expect(viewModel.memory.cards[0]?.curationLabel).toBe("Confirmed");
    expect(viewModel.guidance.cards[0]?.title).toContain("Land the stack migration");
    expect(viewModel.guidance.cards[0]?.evidenceLabel).toContain("linked memories");
    expect(viewModel.guidance.posture.title).toContain("injected");
    expect(viewModel.guidance.cards[0]?.linkedMemoryLabel).toContain("memory ref");
    expect(viewModel.actions.cards[0]?.title).toContain("Approve schema realignment");
    expect(viewModel.actions.posture.title).toContain("open");
    expect(viewModel.actions.mainView.title).toContain("Approve schema realignment");
    expect(viewModel.actions.cards[0]?.contextLabel).toContain("guidance link");
  });

  it("derives thread-centered trace, file changes, and linked context for sessions", () => {
    const snapshot = createPreviewStoreSnapshot();
    const state = setShellPrimaryScreen(
      selectShellThread(
        selectShellSession(
          createInitialShellUiState(snapshot),
          "session-submind-current"
        ),
        "thread-submind-migration"
      ),
      "sessions"
    );
    const viewModel = createShellViewModel(snapshot, state);

    expect(viewModel.sessions.activeSessionId).toBe("session-submind-current");
    expect(viewModel.sessions.activeThreadId).toBe("thread-submind-migration");
    expect(viewModel.sessions.threads[0]?.title).toContain("Stack migration");
    expect(viewModel.sessions.threads[0]?.sourceLabel).toBe("Codex");
    expect(viewModel.sessions.tasks[0]?.title).toContain("Move the shell to React");
    expect(viewModel.sessions.traceItems[0]?.originLabel).toBe("Submind");
    expect(viewModel.sessions.traceItems[1]?.fileChangeLabel).toContain("file change");
    expect(viewModel.sessions.fileChanges).toHaveLength(2);
    expect(
      viewModel.sessions.fileChanges.some((fileChange) =>
        fileChange.path.includes("main.tsx")
      )
    ).toBe(true);
    expect(viewModel.sessions.linkedContext[0]?.kind).toBe("action");
    expect(viewModel.sessions.linkedContext[1]?.kind).toBe("guidance");
    expect(viewModel.sessions.linkedContext[2]?.kind).toBe("memory");
  });

  it("derives explicit thread source labels for Codex and Copilot threads", () => {
    const baseSnapshot = createPreviewStoreSnapshot();
    const snapshot = {
      ...baseSnapshot,
      sessions: [
        ...baseSnapshot.sessions,
        {
          kind: "Session" as const,
          id: "session-copilot-review",
          profileId: "profile-operator",
          projectId: "project-submind",
          status: "active" as const,
          summary: "Copilot-assisted review of operator shell polish.",
          startedAt: "2026-03-30T10:05:00.000Z",
          createdAt: "2026-03-30T10:05:00.000Z",
          updatedAt: "2026-03-30T10:12:00.000Z"
        }
      ],
      threads: [
        ...baseSnapshot.threads,
        {
          kind: "Thread" as const,
          id: "thread-copilot-review",
          sessionId: "session-copilot-review",
          projectId: "project-submind",
          title: "Copilot shell polish review",
          status: "open" as const,
          summary: "Use Copilot chat to inspect shell density and polish.",
          createdAt: "2026-03-30T10:05:00.000Z",
          updatedAt: "2026-03-30T10:12:00.000Z"
        }
      ],
      events: [
        ...baseSnapshot.events,
        {
          kind: "Event" as const,
          id: "event-copilot-session-opened",
          projectId: "project-submind",
          sessionId: "session-copilot-review",
          threadId: "thread-copilot-review",
          originType: "system" as const,
          eventType: "copilot_session_opened",
          category: "lifecycle" as const,
          nodeCategory: "anchor" as const,
          timestamp: "2026-03-30T10:05:00.000Z",
          summary: "Opened GitHub Copilot chat for shell polish review.",
          metadata: {
            source: "copilot"
          },
          createdAt: "2026-03-30T10:05:00.000Z",
          updatedAt: "2026-03-30T10:05:00.000Z"
        }
      ]
    };

    const codexViewModel = createShellViewModel(
      snapshot,
      setShellPrimaryScreen(
        selectShellSession(createInitialShellUiState(snapshot), "session-submind-current"),
        "sessions"
      )
    );
    const copilotViewModel = createShellViewModel(
      snapshot,
      setShellPrimaryScreen(
        selectShellSession(createInitialShellUiState(snapshot), "session-copilot-review"),
        "sessions"
      )
    );

    expect(
      codexViewModel.sessions.threads.find(
        (thread) => thread.threadId === "thread-submind-migration"
      )?.sourceLabel
    ).toBe("Codex");
    expect(
      codexViewModel.sessions.threads.find(
        (thread) => thread.threadId === "thread-submind-native"
      )?.sourceLabel
    ).toBe("Codex");
    expect(copilotViewModel.sessions.threads[0]?.sourceLabel).toBe("Copilot");
  });

  it("derives action controls, draft outcome, and action history for the live action loop", async () => {
    const repository = createPreviewRepository(createPreviewStoreSnapshot());

    await repository.transitionAction({
      actionId: "action-submind-schema",
      nextState: "approved",
      actualOutcome: "Schema realignment landed on the persisted contract path.",
      timestamp: "2026-03-30T10:15:00.000Z"
    });

    const snapshot = await repository.getSnapshot();
    const state = setShellPrimaryScreen(
      selectShellAction(createInitialShellUiState(snapshot), "action-submind-schema"),
      "actions"
    );
    const viewModel = createShellViewModel(snapshot, state, {
      actionOutcomeDraft:
        "Schema realignment landed on the persisted contract path.",
      isActionMutationPending: true,
      pendingActionTransition: "resolved"
    });

    expect(viewModel.actions.activeActionId).toBe("action-submind-schema");
    expect(viewModel.actions.expectedOutcome).toContain("Shared schemas");
    expect(viewModel.actions.actualOutcome).toContain("persisted contract path");
    expect(viewModel.actions.transitionControls.map((control) => control.nextState)).toEqual(
      ["resolved", "blocked", "rejected"]
    );
    expect(viewModel.actions.pendingActionTransition).toBe("resolved");
    expect(viewModel.actions.historyItems[0]?.transitionLabel).toBe(
      "Pending -> Approved"
    );
    expect(viewModel.actions.historyItems[0]?.summary).toContain(
      "moved from pending to approved"
    );
  });

  it("derives retained memory provenance and evidence-backed guidance inspectors", () => {
    const snapshot = createPreviewStoreSnapshot();
    const state = setShellPrimaryScreen(
      selectShellGuidance(
        selectShellMemory(
          createInitialShellUiState(snapshot),
          "memory-submind-architecture"
        ),
        "guidance-submind-stack"
      ),
      "guidance"
    );
    const viewModel = createShellViewModel(snapshot, state, {
      memorySummaryDraft: "Thin desktop shell boundary",
      memoryContentDraft:
        "apps/desktop stays thin while packages own runtime, state, and retained knowledge.",
      memoryStatusDraft: "active",
      memoryPinnedDraft: true,
      isMemoryMutationPending: true
    });

    expect(viewModel.memory.inspector.provenanceSummary).toContain("source event");
    expect(
      viewModel.memory.inspector.sourceFiles.some((fileChange) =>
        fileChange.path.endsWith(".tsx")
      )
    ).toBe(true);
    expect(viewModel.memory.inspector.historyItems[0]?.summary).toContain(
      "Renderer migration"
    );
    expect(viewModel.memory.draftSummary).toContain("Thin desktop shell boundary");
    expect(viewModel.memory.isMutationPending).toBe(true);
    expect(viewModel.guidance.inspector.evidenceSummary).toContain("linked memories");
    expect(viewModel.guidance.inspector.policySummary).toContain("Schema");
    expect(viewModel.guidance.inspector.linkedContext[0]?.kind).toBe("action");
    expect(viewModel.guidance.inspector.historyItems[0]?.summary).toContain(
      "Renderer migration"
    );
  });

  it("derives exact context supply provenance from the latest audit event", () => {
    const snapshot = createPreviewStoreSnapshot();
    snapshot.events.unshift({
      ...snapshot.events[0]!,
      id: "event-context-supplied-test",
      projectId: "project-submind",
      threadId: "thread-submind-migration",
      eventType: "context_bundle_supplied",
      category: "guidance",
      nodeCategory: "cognitive",
      timestamp: "2026-07-03T15:00:00.000Z",
      summary: "SubMind supplied one context data point for SubMind.",
      metadata: {
        bundleId: "context-bundle-test",
        rankingMode: "model",
        model: "test-context-ranker",
        estimatedTokens: 42,
        omittedCount: 3,
        composedContext: "Exact context supplied to the requesting software.",
        suppliedItems: [
          {
            id: "context-memory-test",
            kind: "memory",
            title: "Architecture boundary",
            content: "Keep the desktop shell thin.",
            relevanceScore: 0.94,
            relevanceRationale: "Directly constrains the requested implementation.",
            sources: [
              {
                entityType: "MemoryItem",
                entityId: "memory-submind-architecture",
                label: "Architecture boundary"
              }
            ]
          }
        ]
      }
    });
    const viewModel = createShellViewModel(
      snapshot,
      setShellPrimaryScreen(createInitialShellUiState(snapshot), "guidance")
    );

    expect(viewModel.guidance.suppliedContext.hasSupply).toBe(true);
    expect(viewModel.guidance.suppliedContext.bundleId).toBe("context-bundle-test");
    expect(viewModel.guidance.suppliedContext.modelLabel).toBe("test-context-ranker");
    expect(viewModel.guidance.suppliedContext.composedContext).toContain("Exact context");
    expect(viewModel.guidance.suppliedContext.items[0]?.sources[0]).toMatchObject({
      entityType: "MemoryItem",
      entityId: "memory-submind-architecture"
    });
  });

  it("redacts protected values by default and only reveals the selected visible fingerprint temporarily", () => {
    const memorySecret = "sm_MEMORYTOKENabcdefghijklmnopqrstuvwxyz123456";
    const eventSecret = "sm_EVENTTOKENabcdefghijklmnopqrstuvwxyz123456";
    const baseSnapshot = createPreviewStoreSnapshot();
    const snapshot = {
      ...baseSnapshot,
      memory: baseSnapshot.memory.map((memoryItem) =>
        memoryItem.id === "memory-submind-architecture"
          ? {
              ...memoryItem,
              content: `${memoryItem.content} Captured token ${memorySecret}.`
            }
          : memoryItem
      ),
      events: baseSnapshot.events.map((event) =>
        event.id === "event-submind-shell"
          ? {
              ...event,
              summary: `${event.summary} Hidden event token ${eventSecret}.`
            }
          : event
      )
    };
    const state = setShellPrimaryScreen(
      selectShellMemory(
        createInitialShellUiState(snapshot),
        "memory-submind-architecture"
      ),
      "memory"
    );
    const hiddenViewModel = createShellViewModel(snapshot, state, {
      memoryContentDraft:
        snapshot.memory.find((memoryItem) => memoryItem.id === "memory-submind-architecture")
          ?.content ?? ""
    });
    const hiddenJson = JSON.stringify(hiddenViewModel);
    const redactionMatch = hiddenViewModel.memory.inspector.content.match(
      /\[redacted:([^:\]\s]+):([a-f0-9]{8})\]/i
    );
    const revealTarget = redactionMatch
      ? { label: redactionMatch[1]!, fingerprint: redactionMatch[2]! }
      : null;

    expect(hiddenViewModel.secretProtection.canReveal).toBe(false);
    expect(hiddenJson).not.toContain(memorySecret);
    expect(hiddenJson).not.toContain(eventSecret);
    expect(hiddenJson).toContain("[redacted:");
    expect(revealTarget).not.toBeNull();

    const revealedViewModel = createShellViewModel(
      snapshot,
      revealTarget ? revealShellSecretTarget(state, revealTarget) : state,
      {
        memoryContentDraft:
          snapshot.memory.find((memoryItem) => memoryItem.id === "memory-submind-architecture")
            ?.content ?? ""
      }
    );

    expect(revealedViewModel.secretProtection.isRevealing).toBe(true);
    expect(revealedViewModel.memory.inspector.content).toContain(memorySecret);
    expect(revealedViewModel.memory.draftContent).toContain(memorySecret);
    expect(JSON.stringify(revealedViewModel)).not.toContain(eventSecret);
  });
});
