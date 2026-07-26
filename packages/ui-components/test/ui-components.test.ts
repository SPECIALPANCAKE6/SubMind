import { createRequire } from "node:module";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { createPreviewStoreSnapshot } from "../../store/src/index";
import {
  clearShellProjectSelection,
  createInitialShellUiState,
  createShellViewModel,
  openShellSupportSurface,
  selectShellAction,
  selectShellGuidance,
  selectShellMemory,
  setShellPrimaryScreen,
  toggleShellProjectFocus
} from "../../ui-state/src/index";
import { SubMindShell } from "../src/index";

const requireFromDesktop = createRequire(
  new URL("../../../apps/desktop/package.json", import.meta.url)
);
const { renderToStaticMarkup } = requireFromDesktop(
  "react-dom/server"
) as typeof import("react-dom/server");

describe("ui-components", () => {
  const noopActions = {
    onLayoutModeChange: () => undefined,
    onPrimaryScreenChange: () => undefined,
    onOpenSettings: () => undefined,
    onCloseSupportSurface: () => undefined,
    onSettingsConfigChange: () => undefined,
    onResetSettingsConfig: () => undefined,
    onSelectProject: () => undefined,
    onToggleProjectFocus: () => undefined,
    onFocusSelectedProject: () => undefined,
    onClearProjectSelection: () => undefined,
    onClearProjectFocus: () => undefined,
    onProjectSearchChange: () => undefined,
    onRevealSecretTarget: () => undefined,
    onHideSecretTarget: () => undefined,
    onSelectSession: () => undefined,
    onSelectThread: () => undefined,
    onSelectMemory: () => undefined,
    onSelectGuidance: () => undefined,
    onSelectAction: () => undefined,
    onActionOutcomeDraftChange: () => undefined,
    onTransitionAction: () => undefined,
    onMemorySummaryDraftChange: () => undefined,
    onMemoryContentDraftChange: () => undefined,
    onMemoryStatusDraftChange: () => undefined,
    onMemoryPinnedDraftChange: () => undefined,
    onSaveMemory: () => undefined
  };

  it("renders the command strip, project stack, and dashboard shell", () => {
    const snapshot = createPreviewStoreSnapshot();
    const markup = renderToStaticMarkup(
      createElement(SubMindShell, {
        viewModel: createShellViewModel(
          snapshot,
          createInitialShellUiState(snapshot)
        ),
        actions: noopActions
      })
    );

    expect(markup).toContain('aria-label="Primary screens"');
    expect(markup).toContain("Atlas Ops");
    expect(markup).toContain("sm-project-rail");
    expect(markup).toContain('data-project-state="selected"');
    expect(markup).toContain('data-dashboard-mode="selected"');
    expect(markup).toContain('data-stack-mode="selected"');
    expect(markup).toContain("Magnetized");
    expect(markup).toContain("Focus");
    expect(markup).toContain("sm-project-card__identity");
    expect(markup).toContain('aria-label="Search projects"');
    expect(markup).toContain("3 projects");
    expect(markup).not.toContain(">Unfocus<");
  });

  it("renders the unselected dashboard mode without a committed project", () => {
    const snapshot = createPreviewStoreSnapshot();
    const markup = renderToStaticMarkup(
      createElement(SubMindShell, {
        viewModel: createShellViewModel(
          snapshot,
          clearShellProjectSelection(createInitialShellUiState(snapshot))
        ),
        actions: noopActions
      })
    );

    expect(markup).toContain('data-dashboard-mode="unselected"');
    expect(markup).toContain('data-stack-mode="unselected"');
    expect(markup).toContain("Broad command center");
    expect(markup).toContain("Global Dashboard");
    expect(markup).not.toContain(">Unselected</span>");
  });

  it("renders the focused actions screen and risk inspector", () => {
    const snapshot = createPreviewStoreSnapshot();
    const state = setShellPrimaryScreen(
      selectShellAction(
        toggleShellProjectFocus(
          createInitialShellUiState(snapshot),
          "project-submind"
        ),
        "action-submind-schema"
      ),
      "actions"
    );
    const markup = renderToStaticMarkup(
      createElement(SubMindShell, {
        viewModel: createShellViewModel(snapshot, state),
        actions: noopActions
      })
    );

    expect(markup).toContain("Action Checkpoint");
    expect(markup).toContain("sm-actions-shell");
    expect(markup).toContain("sm-action-queue");
    expect(markup).toContain("sm-action-main-stack");
    expect(markup).toContain("sm-action-audit-stack");
    expect(markup).toContain("Action Main View");
    expect(markup).toContain("Audit / Context Inspector");
    expect(markup).toContain("Approve schema realignment for Project, Event, and ActionItem");
    expect(markup).toContain("project-focused");
    expect(markup).toContain("Actions");
    expect(markup).toContain('data-project-state="focused"');
    expect(markup).toContain('data-stack-mode="focused"');
    expect(markup).toContain("Exit Focus");
    expect(markup).toContain("guidance link");
    expect(markup).toContain("actual outcome");
    expect(markup).toContain("Expected Outcome");
    expect(markup).toContain("Action History");
    expect(markup).toContain("Approve");
    expect(markup).toContain("Reject");
    expect(markup).toContain("Block");
  });

  it("renders the deep sessions screen with threads, event sequence, file changes, and linked context", () => {
    const snapshot = createPreviewStoreSnapshot();
    const state = setShellPrimaryScreen(
      createInitialShellUiState(snapshot),
      "sessions"
    );
    const markup = renderToStaticMarkup(
      createElement(SubMindShell, {
        viewModel: createShellViewModel(snapshot, state),
        actions: noopActions
      })
    );

    expect(markup).toContain("Work Navigator");
    expect(markup).toContain("sm-work-navigator");
    expect(markup).toContain("Threads");
    expect(markup).toContain("sm-status-pill--origin-codex");
    expect(markup).toContain("Activity Graph / Work Trace");
    expect(markup).toContain("sm-work-trace-stack");
    expect(markup).toContain("File Changes");
    expect(markup).toContain("Context Inspector");
    expect(markup).toContain("sm-context-inspector-stack");
    expect(markup).toContain("Open Guidance");
  });

  it("renders settings as a support surface with runtime and return controls", () => {
    const snapshot = createPreviewStoreSnapshot();
    const state = openShellSupportSurface(
      setShellPrimaryScreen(createInitialShellUiState(snapshot), "actions"),
      "settings"
    );
    const markup = renderToStaticMarkup(
      createElement(SubMindShell, {
        viewModel: createShellViewModel(snapshot, state),
        actions: noopActions
      })
    );

    expect(markup).toContain("Settings / support surface");
    expect(markup).toContain("Editable shell configuration, not a primary screen");
    expect(markup).toContain("Editable shell settings");
    expect(markup).toContain("Session editable");
    expect(markup).toContain("type=\"number\"");
    expect(markup).toContain("<select");
    expect(markup).toContain("Details / Metrics");
    expect(markup).toContain("Configuration impact");
    expect(markup).toContain("Reset");
    expect(markup).toContain("Observed integration trace");
    expect(markup).toContain("Operator Shell");
    expect(markup).toContain("Scope And Launch");
    expect(markup).toContain("Cognition And Control");
    expect(markup).toContain("Return to Actions");
    expect(markup).toContain("Close Settings");
    expect(markup).toContain('data-primary-screen="settings"');
    expect(markup).toContain('data-support-surface="settings"');
  });

  it("renders guidance posture and evidence labels in the guidance screen", () => {
    const snapshot = createPreviewStoreSnapshot();
    const state = setShellPrimaryScreen(
      selectShellGuidance(
        toggleShellProjectFocus(
          createInitialShellUiState(snapshot),
          "project-submind"
        ),
        "guidance-submind-stack"
      ),
      "guidance"
    );
    const markup = renderToStaticMarkup(
      createElement(SubMindShell, {
        viewModel: createShellViewModel(snapshot, state),
        actions: noopActions
      })
    );

    expect(markup).toContain("Guidance Checkpoint");
    expect(markup).toContain("sm-guidance-shell");
    expect(markup).toContain("Guidance Feed");
    expect(markup).toContain("Injected Guidance Main View");
    expect(markup).toContain("Tuning / Decision Inspector");
    expect(markup).toContain("memory ref");
    expect(markup).toContain("related action");
    expect(markup).toContain("Decision Inspector");
    expect(markup).toContain("Evidence Events");
    expect(markup).toContain("Guidance History");
    expect(markup).toContain("SubMind Context Supplied");
    expect(markup).toContain("No supply recorded");
  });

  it("renders the exact supplied context and source identities from audit provenance", () => {
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
        rankingMode: "deterministic_fallback",
        estimatedTokens: 42,
        omittedCount: 0,
        composedContext: "Exact context supplied to Codex.",
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
    const markup = renderToStaticMarkup(
      createElement(SubMindShell, {
        viewModel: createShellViewModel(
          snapshot,
          setShellPrimaryScreen(createInitialShellUiState(snapshot), "guidance")
        ),
        actions: noopActions
      })
    );

    expect(markup).toContain("Exact Composed Context");
    expect(markup).toContain("Exact context supplied to Codex.");
    expect(markup).toContain("Architecture boundary");
    expect(markup).toContain("MemoryItem:memory-submind-architecture");
    expect(markup).toContain("Deterministic Fallback");
  });

  it("renders retained memory inspector, curation controls, and provenance surfaces", () => {
    const snapshot = createPreviewStoreSnapshot();
    const state = setShellPrimaryScreen(
      createInitialShellUiState(snapshot),
      "memory"
    );
    const markup = renderToStaticMarkup(
      createElement(SubMindShell, {
        viewModel: createShellViewModel(snapshot, state, {
          memorySummaryDraft: "Thin desktop shell boundary",
          memoryContentDraft:
            "apps/desktop stays thin while packages own runtime, state, and retained knowledge.",
          memoryStatusDraft: "active",
          memoryPinnedDraft: true,
          isMemoryMutationPending: true
        }),
        actions: noopActions
      })
    );

    expect(markup).toContain("Memory Inspector");
    expect(markup).toContain("Memory Curation");
    expect(markup).toContain("Source Events");
    expect(markup).toContain("Source Files");
    expect(markup).toContain("What Changed");
    expect(markup).toContain("Confirm Memory");
    expect(markup).toContain("Saving...");
  });

  it("renders inline redaction reveal affordances without exposing hidden data by default", () => {
    const secret = "sm_MEMORYTOKENabcdefghijklmnopqrstuvwxyz123456";
    const baseSnapshot = createPreviewStoreSnapshot();
    const snapshot = {
      ...baseSnapshot,
      memory: baseSnapshot.memory.map((memoryItem) =>
        memoryItem.id === "memory-submind-architecture"
          ? {
              ...memoryItem,
              content: `${memoryItem.content} Hidden token ${secret}.`
            }
          : memoryItem
      )
    };
    const state = setShellPrimaryScreen(
      selectShellMemory(
        createInitialShellUiState(snapshot),
        "memory-submind-architecture"
      ),
      "memory"
    );
    const markup = renderToStaticMarkup(
      createElement(SubMindShell, {
        viewModel: createShellViewModel(snapshot, state),
        actions: noopActions
      })
    );

    expect(markup).toContain("sm-redacted-secret");
    expect(markup).toContain("sm-redacted-secret__bubble");
    expect(markup).toContain("Reveal all visible submind token occurrences");
    expect(markup).toContain("[redacted:");
    expect(markup).not.toContain(secret);
    expect(markup).not.toContain("Reveal Hidden Data");
  });

  it("renders a dedicated operator shell with a left rail and right workspace", () => {
    const snapshot = createPreviewStoreSnapshot();
    const markup = renderToStaticMarkup(
      createElement(SubMindShell, {
        viewModel: createShellViewModel(
          snapshot,
          createInitialShellUiState(snapshot)
        ),
        actions: noopActions
      })
    );

    expect(markup).toContain('class="sm-operator-shell"');
    expect(markup).toContain('class="sm-project-rail"');
    expect(markup).toContain('class="sm-workspace-shell min-w-0"');
    expect(markup).toContain("sm-command-strip__zone sm-command-strip__zone--left");
    expect(markup).toContain("sm-command-strip__zone sm-command-strip__zone--center sm-command-strip__controls");
    expect(markup).toContain("sm-command-strip__zone sm-command-strip__zone--right sm-command-strip__metrics");
    expect(markup).toContain("sm-workspace-frame");
    expect(markup).toContain('class="sm-workspace-content"');
    expect(markup).toContain("sm-tone-card--interactive");
    expect(markup).toContain("Open Guidance");
    expect(markup).toContain("sm-dashboard-deepening sm-dashboard-deepening--triple");
    expect(markup).toContain("sm-workspace-header-grid");
    expect(markup).toContain("max-w-[2400px]");
  });
});
