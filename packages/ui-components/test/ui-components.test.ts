import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createPreviewStoreSnapshot } from "../../store/src/index";
import {
  createInitialShellUiState,
  createShellViewModel,
  selectShellAction,
  selectShellGuidance,
  setShellPrimaryScreen,
  toggleShellProjectFocus
} from "../../ui-state/src/index";
import { SubMindShell } from "../src/index";

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
    onSelectMemory: () => undefined,
    onSelectGuidance: () => undefined,
    onSelectAction: () => undefined
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

    expect(markup).toContain("Top Command Strip");
    expect(markup).toContain("Dashboard");
    expect(markup).toContain("Atlas Ops");
    expect(markup).toContain("Focus Selected");
    expect(markup).toContain("SubMind / global selection");
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
    expect(markup).toContain("guidance link");
    expect(markup).toContain("actual outcome");
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
  });

  it("keeps the shell on responsive grid classes instead of fixed-width markup", () => {
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

    expect(markup).toContain("xl:grid-cols-[minmax(19rem,23rem)_1fr]");
    expect(markup).toContain("lg:grid-cols-2");
    expect(markup).toContain("max-w-[1800px]");
  });
});
