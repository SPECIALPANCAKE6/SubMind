import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SubMindShell } from "@submind/ui-components";
import {
  defaultSettingsConfigDraft,
  normalizeSettingsConfig,
  type MemoryItem,
  type SettingsConfigDraft,
  type SettingsConfigKey,
  type SettingsConfigValue
} from "@submind/shared-schemas";
import {
  type ActionTransitionState,
  createSettingsConfigQueryOptions,
  createShellSnapshotQueryOptions,
  createShellViewModel,
  useSettingsConfigQuery,
  useShellSnapshotQuery,
  useShellStore
} from "@submind/ui-state";
import { createDesktopRepository } from "./index.js";

const desktopRepository = createDesktopRepository();

interface ActionTransitionRequest {
  actionId: string;
  nextState: ActionTransitionState;
  actualOutcome?: string;
}

interface MemoryCurationRequest {
  memoryId: string;
  summary: string;
  content: string;
  status: MemoryItem["status"];
  isPinned: boolean;
  curationState: Extract<MemoryItem["curationState"], "confirmed" | "edited">;
  changeSummary?: string;
}

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
  const queryClient = useQueryClient();
  const settingsDraft = useShellStore((state) => state.settingsDraft);
  const settingsConfigQuery = useSettingsConfigQuery(desktopRepository);
  const snapshotQuery = useShellSnapshotQuery(
    desktopRepository,
    settingsDraft.snapshotRefreshMs
  );
  const [actionOutcomeDraft, setActionOutcomeDraft] = useState("");
  const [memorySummaryDraft, setMemorySummaryDraft] = useState("");
  const [memoryContentDraft, setMemoryContentDraft] = useState("");
  const [memoryStatusDraft, setMemoryStatusDraft] =
    useState<MemoryItem["status"] | "">("");
  const [memoryPinnedDraft, setMemoryPinnedDraft] = useState(false);
  const initializeFromSnapshot = useShellStore(
    (state) => state.initializeFromSnapshot
  );
  const layoutMode = useShellStore((state) => state.layoutMode);
  const primaryScreen = useShellStore((state) => state.primaryScreen);
  const activeSupportSurface = useShellStore(
    (state) => state.activeSupportSurface
  );
  const selectedProjectId = useShellStore((state) => state.selectedProjectId);
  const focusedProjectId = useShellStore((state) => state.focusedProjectId);
  const projectSearchQuery = useShellStore((state) => state.projectSearchQuery);
  const secretRevealTarget = useShellStore((state) => state.secretRevealTarget);
  const activeSessionId = useShellStore((state) => state.activeSessionId);
  const activeThreadId = useShellStore((state) => state.activeThreadId);
  const activeMemoryId = useShellStore((state) => state.activeMemoryId);
  const activeGuidanceId = useShellStore((state) => state.activeGuidanceId);
  const activeActionId = useShellStore((state) => state.activeActionId);
  const activeMemory =
    snapshotQuery.data?.memory.find((memory) => memory.id === activeMemoryId) ?? null;
  const setLayoutMode = useShellStore((state) => state.setLayoutMode);
  const setPrimaryScreen = useShellStore((state) => state.setPrimaryScreen);
  const openSupportSurface = useShellStore(
    (state) => state.openSupportSurface
  );
  const closeSupportSurface = useShellStore(
    (state) => state.closeSupportSurface
  );
  const resetSettingsDraft = useShellStore(
    (state) => state.resetSettingsDraft
  );
  const setSettingsDraft = useShellStore((state) => state.setSettingsDraft);
  const selectProject = useShellStore((state) => state.selectProject);
  const toggleProjectFocus = useShellStore((state) => state.toggleProjectFocus);
  const focusSelectedProject = useShellStore(
    (state) => state.focusSelectedProject
  );
  const clearProjectSelection = useShellStore(
    (state) => state.clearProjectSelection
  );
  const clearProjectFocus = useShellStore((state) => state.clearProjectFocus);
  const setProjectSearchQuery = useShellStore(
    (state) => state.setProjectSearchQuery
  );
  const revealSecretTarget = useShellStore((state) => state.revealSecretTarget);
  const hideSecretTarget = useShellStore((state) => state.hideSecretTarget);
  const selectSession = useShellStore((state) => state.selectSession);
  const selectThread = useShellStore((state) => state.selectThread);
  const selectMemory = useShellStore((state) => state.selectMemory);
  const selectGuidance = useShellStore((state) => state.selectGuidance);
  const selectAction = useShellStore((state) => state.selectAction);
  const activeAction =
    snapshotQuery.data?.actions.find((action) => action.id === activeActionId) ?? null;

  const transitionActionMutation = useMutation({
    mutationFn: async (input: ActionTransitionRequest) =>
      desktopRepository.transitionAction({
        ...input,
        actor: "operator"
      }),
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: createShellSnapshotQueryOptions(desktopRepository).queryKey
      });
    }
  });

  const updateMemoryMutation = useMutation({
    mutationFn: async (input: MemoryCurationRequest) =>
      desktopRepository.updateMemoryItem({
        ...input,
        actor: "operator"
      }),
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: createShellSnapshotQueryOptions(desktopRepository).queryKey
      });
    }
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (input: SettingsConfigDraft) =>
      desktopRepository.updateSettingsConfig(input),
    onSuccess(settingsConfig) {
      setSettingsDraft(settingsConfig);
      queryClient.setQueryData(
        createSettingsConfigQueryOptions(desktopRepository).queryKey,
        settingsConfig
      );
    }
  });

  useEffect(() => {
    if (snapshotQuery.data) {
      initializeFromSnapshot(snapshotQuery.data);
    }
  }, [initializeFromSnapshot, snapshotQuery.data]);

  useEffect(() => {
    if (settingsConfigQuery.data) {
      setSettingsDraft(settingsConfigQuery.data);
    }
  }, [setSettingsDraft, settingsConfigQuery.data]);

  useEffect(() => {
    setActionOutcomeDraft(activeAction?.actualOutcome ?? "");
  }, [activeAction?.id, activeAction?.actualOutcome]);

  useEffect(() => {
    setMemorySummaryDraft(activeMemory?.summary ?? "");
    setMemoryContentDraft(activeMemory?.content ?? "");
    setMemoryStatusDraft(activeMemory?.status ?? "");
    setMemoryPinnedDraft(activeMemory?.isPinned ?? false);
  }, [
    activeMemory?.id,
    activeMemory?.summary,
    activeMemory?.content,
    activeMemory?.status,
    activeMemory?.isPinned
  ]);

  useEffect(() => {
    if (!secretRevealTarget) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      hideSecretTarget();
    }, settingsDraft.secretAutoHideMs);

    return () => window.clearTimeout(timeoutId);
  }, [hideSecretTarget, secretRevealTarget, settingsDraft.secretAutoHideMs]);

  if (snapshotQuery.error) {
    return <ErrorState message={snapshotQuery.error.message} />;
  }

  if (snapshotQuery.isLoading || !snapshotQuery.data) {
    return <LoadingState />;
  }

  const shellState = {
    layoutMode,
    primaryScreen,
    activeSupportSurface,
    settingsDraft,
    selectedProjectId,
    focusedProjectId,
    projectSearchQuery,
    secretRevealTarget,
    activeSessionId,
    activeThreadId,
    activeMemoryId,
    activeGuidanceId,
    activeActionId
  };

  function handleTransitionAction(
    actionId: string,
    nextState: ActionTransitionState
  ) {
    const nextActualOutcome = actionOutcomeDraft.trim();

    transitionActionMutation.mutate({
      actionId,
      nextState,
      ...(nextActualOutcome ? { actualOutcome: nextActualOutcome } : {})
    });
  }

  function handleSaveMemory(
    curationState: Extract<MemoryItem["curationState"], "confirmed" | "edited">
  ) {
    if (!activeMemory || !memoryStatusDraft) {
      return;
    }

    const nextSummary = memorySummaryDraft.trim() || activeMemory.summary;
    const nextContent = memoryContentDraft.trim() || activeMemory.content;

    updateMemoryMutation.mutate({
      memoryId: activeMemory.id,
      summary: nextSummary,
      content: nextContent,
      status: memoryStatusDraft,
      isPinned: memoryPinnedDraft,
      curationState,
      changeSummary:
        curationState === "confirmed"
          ? "Confirmed by the operator after reviewing retained evidence."
          : "Edited by the operator to keep retained knowledge accurate."
    });
  }

  function handleSettingsConfigChange(
    key: SettingsConfigKey,
    value: SettingsConfigValue
  ) {
    const nextSettingsConfig = normalizeSettingsConfig({
      ...settingsDraft,
      [key]: value
    });

    setSettingsDraft(nextSettingsConfig);
    updateSettingsMutation.mutate(nextSettingsConfig);
  }

  function handleResetSettingsConfig() {
    const nextSettingsConfig = { ...defaultSettingsConfigDraft };

    resetSettingsDraft();
    updateSettingsMutation.mutate(nextSettingsConfig);
  }

  return (
    <SubMindShell
      viewModel={createShellViewModel(snapshotQuery.data, shellState, {
        actionOutcomeDraft,
        isActionMutationPending: transitionActionMutation.isPending,
        pendingActionTransition:
          transitionActionMutation.variables?.nextState ?? null,
        memorySummaryDraft,
        memoryContentDraft,
        memoryStatusDraft,
        memoryPinnedDraft,
        isMemoryMutationPending: updateMemoryMutation.isPending
      })}
      actions={{
        onLayoutModeChange: setLayoutMode,
        onPrimaryScreenChange: setPrimaryScreen,
        onOpenSettings: () => openSupportSurface("settings"),
        onCloseSupportSurface: closeSupportSurface,
        onSettingsConfigChange: handleSettingsConfigChange,
        onResetSettingsConfig: handleResetSettingsConfig,
        onSelectProject: selectProject,
        onToggleProjectFocus: toggleProjectFocus,
        onFocusSelectedProject: focusSelectedProject,
        onClearProjectSelection: clearProjectSelection,
        onClearProjectFocus: clearProjectFocus,
        onProjectSearchChange: setProjectSearchQuery,
        onRevealSecretTarget: revealSecretTarget,
        onHideSecretTarget: hideSecretTarget,
        onSelectSession: selectSession,
        onSelectThread: selectThread,
        onSelectMemory: selectMemory,
        onSelectGuidance: selectGuidance,
        onSelectAction: selectAction,
        onActionOutcomeDraftChange: setActionOutcomeDraft,
        onTransitionAction: handleTransitionAction,
        onMemorySummaryDraftChange: setMemorySummaryDraft,
        onMemoryContentDraftChange: setMemoryContentDraft,
        onMemoryStatusDraftChange: setMemoryStatusDraft,
        onMemoryPinnedDraftChange: setMemoryPinnedDraft,
        onSaveMemory: handleSaveMemory
      }}
    />
  );
}
