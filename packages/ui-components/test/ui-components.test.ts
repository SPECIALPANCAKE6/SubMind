import { createRequire } from "node:module";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { createPreviewStoreSnapshot } from "../../store/src/index";
import {
  clearShellProjectSelection,
  createInitialShellUiState,
  createShellViewModel,
  selectShellAction,
  selectShellGuidance,
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
    onSelectProject: () => undefined,
    onToggleProjectFocus: () => undefined,
    onFocusSelectedProject: () => undefined,
    onClearProjectSelection: () => undefined,
    onClearProjectFocus: () => undefined,
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

    expect(markup).toContain("Session Navigator");
    expect(markup).toContain("Threads");
    expect(markup).toContain("Event Sequence");
    expect(markup).toContain("File Changes");
    expect(markup).toContain("Linked Context");
    expect(markup).toContain("Open Guidance");
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
    expect(markup).toContain("memory ref");
    expect(markup).toContain("related action");
    expect(markup).toContain("Decision Inspector");
    expect(markup).toContain("Evidence Events");
    expect(markup).toContain("Guidance History");
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
