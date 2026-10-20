import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SubMindShell } from "@submind/ui-components";
import { redactSensitiveText } from "@submind/policy";
import {
  resetSettingsConfigDraft,
  updateSettingsConfigValue,
  type CheckpointKind,
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
import {
  createDesktopRepository,
  getDesktopActiveSessionDeliveryStatus,
  pushDesktopProposalToActiveSession,
  runDesktopCheckpointNow,
  saveDesktopHermesDeliverySettings
} from "./index.js";

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
  curationState: MemoryItem["curationState"];
  changeSummary?: string;
}

interface CheckpointGenerationRequest {
  checkpoint: CheckpointKind;
  scope: {
    projectId: string;
    sessionId?: string;
    threadId?: string;
  };
}

function mutationErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }
  return redactSensitiveText(
    error instanceof Error ? error.message : String(error)
  ).value;
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
    settingsDraft.app.snapshotRefreshMs
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
  const activeProjectId = focusedProjectId ?? selectedProjectId;
  const activeMemory =
    snapshotQuery.data?.memory.find((memory) => memory.id === activeMemoryId) ??
    snapshotQuery.data?.memory.find(
      (memory) => memory.projectId === activeProjectId
    ) ??
    snapshotQuery.data?.memory.find((memory) => memory.projectId === undefined) ??
    null;
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
  const canRunModelWorkers =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

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

  const generateCheckpointMutation = useMutation({
    mutationFn: async (input: CheckpointGenerationRequest) =>
      runDesktopCheckpointNow(input.checkpoint, input.scope),
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: createShellSnapshotQueryOptions(desktopRepository).queryKey
      });
    }
  });

  const reviewMemoryMutation = useMutation({
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

  const reviewGuidanceMutation = useMutation({
    mutationFn: async (input: {
      guidanceId: string;
      nextState: "suggested" | "suppressed";
    }) => desktopRepository.reviewGuidanceItem(input),
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: createShellSnapshotQueryOptions(desktopRepository).queryKey
      });
    }
  });

  const reviewTaskMutation = useMutation({
    mutationFn: async (input: {
      taskId: string;
      decision: "accept" | "reject";
    }) => desktopRepository.reviewTask(input),
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: createShellSnapshotQueryOptions(desktopRepository).queryKey
      });
    }
  });

  const contextEligibilityMutation = useMutation({
    mutationFn: async (input: {
      entityKind: "MemoryItem" | "GuidanceItem" | "Task";
      entityId: string;
      isEligible: boolean;
    }) => desktopRepository.setContextEligibility({
      ...input,
      timestamp: new Date().toISOString()
    }),
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: createShellSnapshotQueryOptions(desktopRepository).queryKey
      });
    }
  });

  const deliveryStatusQuery = useQuery({
    queryKey: ["active-session-delivery-status"],
    queryFn: getDesktopActiveSessionDeliveryStatus,
    staleTime: 60_000
  });

  const saveHermesSettingsMutation = useMutation({
    mutationFn: saveDesktopHermesDeliverySettings,
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: ["active-session-delivery-status"]
      });
    }
  });

  const pushToActiveSessionMutation = useMutation({
    mutationFn: async (input: { kind: "Task" | "GuidanceItem"; id: string }) => {
      if (!activeSessionId || !activeThreadId) {
        throw new Error("Select an active session and open thread first.");
      }
      return pushDesktopProposalToActiveSession({
        ...input,
        sessionId: activeSessionId,
        threadId: activeThreadId
      });
    },
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: createShellSnapshotQueryOptions(desktopRepository).queryKey
      });
    }
  });

  const revertProposalReviewMutation = useMutation({
    mutationFn: async (eventId: string) =>
      desktopRepository.revertProposalReview({ eventId }),
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

  const updateProjectWorkspaceAliasesMutation = useMutation({
    mutationFn: async (input: {
      projectId: string;
      workspaceAliases: string[];
    }) => desktopRepository.updateProjectWorkspaceAliases(input),
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: createShellSnapshotQueryOptions(desktopRepository).queryKey
      });
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
    }, settingsDraft.profile.secretAutoHideMs);

    return () => window.clearTimeout(timeoutId);
  }, [hideSecretTarget, secretRevealTarget, settingsDraft.profile.secretAutoHideMs]);

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

  function resolveGenerationScope(): CheckpointGenerationRequest["scope"] | null {
    const snapshot = snapshotQuery.data;
    const projectId = focusedProjectId ?? selectedProjectId;
    if (!snapshot || !projectId) {
      return null;
    }
    const activeThread =
      snapshot.threads.find(
        (thread) =>
          thread.id === activeThreadId && thread.projectId === projectId
      ) ??
      snapshot.threads.find(
        (thread) => thread.sessionId === activeSessionId && thread.projectId === projectId
      );
    if (activeThread) {
      return {
        projectId,
        sessionId: activeThread.sessionId,
        threadId: activeThread.id
      };
    }
    const session =
      snapshot.sessions.find(
        (item) => item.id === activeSessionId && item.projectId === projectId
      ) ??
      [...snapshot.sessions]
        .filter((item) => item.projectId === projectId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    return {
      projectId,
      ...(session ? { sessionId: session.id } : {})
    };
  }

  function handleGenerateMemoryAndTasks() {
    const scope = resolveGenerationScope();
    if (!scope) {
      return;
    }
    const checkpoint = scope.threadId ? "thread" : "session";
    generateCheckpointMutation.mutate({ checkpoint, scope });
  }

  function handleGenerateGuidance() {
    const scope = resolveGenerationScope();
    if (!scope) {
      return;
    }
    generateCheckpointMutation.mutate({ checkpoint: "guidance", scope });
  }

  function handleReviewMemory(decision: "accept" | "dismiss") {
    if (!activeMemory) {
      return;
    }
    reviewMemoryMutation.mutate({
      memoryId: activeMemory.id,
      summary: activeMemory.summary,
      content: activeMemory.content,
      status: decision === "accept" ? "active" : "archived",
      isPinned: activeMemory.isPinned,
      curationState: decision === "accept" ? "confirmed" : "derived",
      changeSummary:
        decision === "accept"
          ? "Accepted by the operator after reviewing its evidence."
          : "Dismissed by the operator after review."
    });
  }

  function handleSettingsConfigChange(
    key: SettingsConfigKey,
    value: SettingsConfigValue
  ) {
    const nextSettingsConfig = updateSettingsConfigValue(settingsDraft, key, value, {
      projectId: focusedProjectId
    });

    setSettingsDraft(nextSettingsConfig);
    updateSettingsMutation.mutate(nextSettingsConfig);
  }

  function handleResetSettingsConfig() {
    const nextSettingsConfig = resetSettingsConfigDraft();

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
        isMemoryMutationPending: updateMemoryMutation.isPending,
        canGenerate:
          canRunModelWorkers && Boolean(focusedProjectId ?? selectedProjectId),
        isGenerationPending: generateCheckpointMutation.isPending,
        generationError: mutationErrorMessage(generateCheckpointMutation.error),
        isMemoryReviewPending: reviewMemoryMutation.isPending,
        memoryReviewError: mutationErrorMessage(
          reviewMemoryMutation.error ?? updateMemoryMutation.error
        ),
        isGuidanceReviewPending: reviewGuidanceMutation.isPending,
        guidanceReviewError: mutationErrorMessage(reviewGuidanceMutation.error),
        isTaskReviewPending: reviewTaskMutation.isPending,
        taskReviewError: mutationErrorMessage(reviewTaskMutation.error),
        isContextEligibilityPending: contextEligibilityMutation.isPending,
        contextEligibilityError: mutationErrorMessage(contextEligibilityMutation.error),
        isProposalReviewRevertPending: revertProposalReviewMutation.isPending,
        proposalReviewRevertError: mutationErrorMessage(revertProposalReviewMutation.error),
        activeSessionDeliveryAvailable: deliveryStatusQuery.data?.available === true,
        ...(deliveryStatusQuery.data?.reason
          ? { activeSessionDeliveryUnavailableReason: deliveryStatusQuery.data.reason }
          : {}),
        isActiveSessionPushPending: pushToActiveSessionMutation.isPending,
        activeSessionPushError: mutationErrorMessage(pushToActiveSessionMutation.error),
        activeSessionPushNotice: pushToActiveSessionMutation.isSuccess
          ? "Pushed to the active session. Delivery was audited."
          : null,
        ...(deliveryStatusQuery.data?.settings
          ? {
              hermesDelivery: {
                configured: deliveryStatusQuery.data.settings.configured,
                baseUrl: deliveryStatusQuery.data.settings.baseUrl ?? "",
                allowRemote: deliveryStatusQuery.data.settings.allowRemote ?? false,
                keyConfigured: deliveryStatusQuery.data.settings.keyConfigured ?? false,
                keySource: deliveryStatusQuery.data.settings.keySource ?? null,
                baseUrlFromEnvironment:
                  deliveryStatusQuery.data.settings.baseUrlFromEnvironment ?? false,
                allowRemoteFromEnvironment:
                  deliveryStatusQuery.data.settings.allowRemoteFromEnvironment ?? false,
                reason: deliveryStatusQuery.data.settings.reason ?? null
              }
            }
          : {}),
        isHermesDeliverySavePending: saveHermesSettingsMutation.isPending,
        hermesDeliverySaveError: mutationErrorMessage(saveHermesSettingsMutation.error),
        hermesDeliverySaveNotice: saveHermesSettingsMutation.isSuccess
          ? "Hermes delivery settings saved."
          : null
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
        onProjectWorkspaceAliasesChange: (projectId, workspaceAliases) =>
          updateProjectWorkspaceAliasesMutation.mutate({
            projectId,
            workspaceAliases
          }),
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
        onSaveMemory: handleSaveMemory,
        onGenerateMemoryAndTasks: handleGenerateMemoryAndTasks,
        onReviewMemory: handleReviewMemory,
        onGenerateGuidance: handleGenerateGuidance,
        onReviewGuidance: (nextState) => {
          const guidanceId =
            activeGuidanceId ??
            snapshotQuery.data?.guidance.find(
              (item) => item.projectId === activeProjectId
            )?.id;
          if (guidanceId) {
            reviewGuidanceMutation.mutate({
              guidanceId,
              nextState
            });
          }
        },
        onReviewTask: (taskId, decision) =>
          reviewTaskMutation.mutate({ taskId, decision }),
        onSetContextEligibility: (entityKind, entityId, isEligible) =>
          contextEligibilityMutation.mutate({ entityKind, entityId, isEligible }),
        onRevertProposalReview: (eventId) =>
          revertProposalReviewMutation.mutate(eventId),
        onPushToActiveSession: (kind, id) =>
          pushToActiveSessionMutation.mutate({ kind, id }),
        onSaveHermesDeliverySettings: (input) =>
          saveHermesSettingsMutation.mutate(input)
      }}
    />
  );
}
