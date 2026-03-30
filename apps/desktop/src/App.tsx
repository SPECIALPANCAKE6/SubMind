import { useEffect } from "react";
import { SubMindShell } from "@submind/ui-components";
import { createShellViewModel, useShellSnapshotQuery, useShellStore } from "@submind/ui-state";
import { createDesktopPreviewBootstrap } from "./index.js";

const previewBootstrap = createDesktopPreviewBootstrap();

function LoadingState() {
  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top_left,rgba(124,90,166,0.18),transparent_28%),linear-gradient(180deg,#f5efe8_0%,#edf3f6_100%)] px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-[30px] border border-slate-900/10 bg-white/85 p-8 shadow-[0_20px_48px_rgba(15,23,42,0.08)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
          SubMind
        </p>
        <h1 className="mt-3 font-['Aptos_Display','Bahnschrift','Segoe_UI',sans-serif] text-4xl leading-none text-slate-950">
          Loading operator shell
        </h1>
        <p className="mt-4 max-w-[56ch] text-sm leading-6 text-slate-600">
          Bootstrapping snapshot state, project scope, and the primary screen shell.
        </p>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top_left,rgba(124,90,166,0.18),transparent_28%),linear-gradient(180deg,#f5efe8_0%,#edf3f6_100%)] px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-[30px] border border-[#f3c55c]/80 bg-white/90 p-8 shadow-[0_20px_48px_rgba(15,23,42,0.08)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
          SubMind
        </p>
        <h1 className="mt-3 font-['Aptos_Display','Bahnschrift','Segoe_UI',sans-serif] text-4xl leading-none text-slate-950">
          Shell bootstrap failed
        </h1>
        <p className="mt-4 max-w-[56ch] text-sm leading-6 text-slate-600">
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
