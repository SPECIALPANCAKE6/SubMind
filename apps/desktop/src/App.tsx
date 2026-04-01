import { useEffect } from "react";
import { SubMindShell } from "@submind/ui-components";
import { createShellViewModel, useShellSnapshotQuery, useShellStore } from "@submind/ui-state";
import { createDesktopPreviewBootstrap } from "./index.js";

const previewBootstrap = createDesktopPreviewBootstrap();

function LoadingState() {
  return (
    <div className="sm-startup-state">
      <div className="sm-startup-panel">
        <p className="sm-label">
          SubMind
        </p>
        <h1 className="sm-display mt-3 text-4xl leading-none text-[var(--sm-text-strong)]">
          Loading operator shell
        </h1>
        <p className="sm-copy mt-4 max-w-[56ch] text-sm leading-7">
          Bootstrapping snapshot state, project scope, and the primary screen shell.
        </p>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="sm-startup-state">
      <div className="sm-startup-panel border-[rgba(215,162,76,0.35)]">
        <p className="sm-label">
          SubMind
        </p>
        <h1 className="sm-display mt-3 text-4xl leading-none text-[var(--sm-text-strong)]">
          Shell bootstrap failed
        </h1>
        <p className="sm-copy mt-4 max-w-[56ch] text-sm leading-7">
          {message}
        </p>
      </div>
    </div>
  );
}

export function DesktopApp() {
  const snapshotQuery = useShellSnapshotQuery(previewBootstrap.repository);
  const initializeFromSnapshot = useShellStore(
    (state) => state.initializeFromSnapshot
  );
  const layoutMode = useShellStore((state) => state.layoutMode);
  const primaryScreen = useShellStore((state) => state.primaryScreen);
  const selectedProjectId = useShellStore((state) => state.selectedProjectId);
  const focusedProjectId = useShellStore((state) => state.focusedProjectId);
  const activeSessionId = useShellStore((state) => state.activeSessionId);
  const activeMemoryId = useShellStore((state) => state.activeMemoryId);
  const activeGuidanceId = useShellStore((state) => state.activeGuidanceId);
  const activeActionId = useShellStore((state) => state.activeActionId);
  const setLayoutMode = useShellStore((state) => state.setLayoutMode);
  const setPrimaryScreen = useShellStore((state) => state.setPrimaryScreen);
  const selectProject = useShellStore((state) => state.selectProject);
  const toggleProjectFocus = useShellStore((state) => state.toggleProjectFocus);
  const focusSelectedProject = useShellStore(
    (state) => state.focusSelectedProject
  );
  const clearProjectSelection = useShellStore(
    (state) => state.clearProjectSelection
  );
  const clearProjectFocus = useShellStore((state) => state.clearProjectFocus);
  const selectSession = useShellStore((state) => state.selectSession);
  const selectMemory = useShellStore((state) => state.selectMemory);
  const selectGuidance = useShellStore((state) => state.selectGuidance);
  const selectAction = useShellStore((state) => state.selectAction);

  useEffect(() => {
    if (snapshotQuery.data) {
      initializeFromSnapshot(snapshotQuery.data);
    }
  }, [initializeFromSnapshot, snapshotQuery.data]);

  if (snapshotQuery.error) {
    return <ErrorState message={snapshotQuery.error.message} />;
  }

  if (snapshotQuery.isLoading || !snapshotQuery.data) {
    return <LoadingState />;
  }

  const shellState = {
    layoutMode,
    primaryScreen,
    selectedProjectId,
    focusedProjectId,
    activeSessionId,
    activeMemoryId,
    activeGuidanceId,
    activeActionId
  };

  return (
    <SubMindShell
      viewModel={createShellViewModel(snapshotQuery.data, shellState)}
      actions={{
        onLayoutModeChange: setLayoutMode,
        onPrimaryScreenChange: setPrimaryScreen,
        onSelectProject: selectProject,
        onToggleProjectFocus: toggleProjectFocus,
        onFocusSelectedProject: focusSelectedProject,
        onClearProjectSelection: clearProjectSelection,
        onClearProjectFocus: clearProjectFocus,
        onSelectSession: selectSession,
        onSelectMemory: selectMemory,
        onSelectGuidance: selectGuidance,
        onSelectAction: selectAction
      }}
    />
  );
}
