import { describe, expect, it } from "vitest";

import { createPreviewStoreSnapshot } from "../../store/src/index";
import {
  clearFocusedShellProject,
  clearShellProjectSelection,
  createInitialShellUiState,
  createShellViewModel,
  focusSelectedShellProject,
  getProjectCardState,
  getShellScope,
  selectShellAction,
  selectShellGuidance,
  selectShellMemory,
  selectShellProject,
  selectShellSession,
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

  it("tracks screen and detail selections across sessions, memory, guidance, and actions", () => {
    const snapshot = createPreviewStoreSnapshot();
    const base = createInitialShellUiState(snapshot);
    const sessions = selectShellSession(base, "session-submind-current");
    const memory = selectShellMemory(sessions, "memory-submind-architecture");
    const guidance = selectShellGuidance(memory, "guidance-submind-stack");
    const actions = selectShellAction(guidance, "action-submind-schema");
    const screen = setShellPrimaryScreen(actions, "actions");

    expect(screen.activeSessionId).toBe("session-submind-current");
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
    expect(viewModel.guidance.cards[0]?.title).toContain("Land the stack migration");
    expect(viewModel.guidance.posture.title).toContain("injected");
    expect(viewModel.guidance.cards[0]?.linkedMemoryLabel).toContain("memory ref");
    expect(viewModel.actions.cards[0]?.title).toContain("Approve schema realignment");
    expect(viewModel.actions.posture.title).toContain("open");
    expect(viewModel.actions.mainView.title).toContain("Approve schema realignment");
    expect(viewModel.actions.cards[0]?.contextLabel).toContain("guidance link");
  });
});
