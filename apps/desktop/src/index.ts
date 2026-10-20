import {
  createAgentObservationSource,
  createCheckpointPipeline,
  createObservationRefresh,
  createWorkTraceEnvelope,
  describeRuntimeContext,
  pushProposalToActiveSession,
  type ActiveSessionProposal
} from "@submind/core";
import {
  createNativeHermesSessionDeliveryAdapter,
  getHermesNativeDeliveryStatus,
  saveHermesNativeDeliverySettings,
  type HermesNativeDeliveryStatus,
  type HermesNativeSettingsInput
} from "@submind/protocol-hermes";
import type {
  CheckpointKind,
  SettingsConfigDraft
} from "@submind/shared-schemas";
import { redactSensitiveText, starterSubagents } from "@submind/policy";
import {
  copilotAdapter,
  type CopilotRuntimeFeed
} from "@submind/protocol-copilot";
import {
  codexAdapter,
  type CodexRuntimeFeed
} from "@submind/protocol-codex";
import {
  type ActionStateTransitionInput,
  type ContextEligibilityInput,
  type EventHistoryQueryInput,
  type FileChangeHistoryQueryInput,
  type GuidanceReviewInput,
  type MemoryCurationInput,
  type ProjectExportQueryInput,
  type ProjectSearchInput,
  type ProjectWorkspaceAliasesInput,
  type RevertProposalReviewInput,
  createPreviewRepository,
  createSqliteCheckpointTriggerQueue,
  createSqliteRepository,
  createPreviewStoreSnapshot,
  getPrimarySessionThread,
  getProjectSessions,
  syncRuntimeSnapshotIntoDatabase,
  subMindSqliteDatabasePath,
  type SubMindRepository,
  type SubMindStoreSnapshot,
  type TaskReviewInput
} from "@submind/store";
import {
  createInitialShellUiState,
  layoutModes,
  primaryScreens
} from "@submind/ui-state";
import {
  createNativeModelWorkerAdapter,
  createWorkerPlan,
  type CheckpointWorkerScope
} from "@submind/workers";

let desktopRepositoryInstance: SubMindRepository | undefined;
let checkpointPipeline:
  | ReturnType<typeof createCheckpointPipeline>
  | undefined;

export const desktopShellManifest = {
  name: "SubMind Desktop",
  layoutModes,
  primaryScreens
} as const;

function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in window
  );
}

interface TauriInternalsWindow extends Window {
  __TAURI_INTERNALS__?: {
    invoke<T>(command: string, payload?: Record<string, unknown>): Promise<T>;
  };
}

type TauriInvoke = <T>(
  command: string,
  payload?: Record<string, unknown>
) => Promise<T>;

function getTauriInvoker(): TauriInvoke | null {
  if (!isTauriRuntime()) {
    return null;
  }

  const tauriWindow = window as TauriInternalsWindow;

  return tauriWindow.__TAURI_INTERNALS__?.invoke ?? null;
}

function desktopObservationSources() {
  const invoke = getTauriInvoker();
  return invoke ? [
    createAgentObservationSource(codexAdapter, () => invoke<CodexRuntimeFeed>("load_codex_runtime_feed", { limit: 24 })),
    createAgentObservationSource(copilotAdapter, () => invoke<CopilotRuntimeFeed>("load_copilot_runtime_feed", { limit: 24 }))
  ] : [];
}

export async function executeDesktopCheckpointModelWorkers(
  checkpoint: CheckpointKind,
  scope: CheckpointWorkerScope
) {
  await createDesktopRepository().getSnapshot();
  if (!checkpointPipeline) {
    throw new Error("Checkpoint model workers require the native desktop runtime.");
  }
  const { run, proposals } = await checkpointPipeline.execute(checkpoint, scope);
  return { ...run, proposals };
}

export async function triggerDesktopCheckpoint(
  checkpoint: CheckpointKind,
  scope: CheckpointWorkerScope
): Promise<void> {
  await createDesktopRepository().getSnapshot();
  if (!checkpointPipeline) {
    throw new Error("The desktop checkpoint pipeline is not initialized.");
  }
  checkpointPipeline.trigger(checkpoint, scope);
}

export async function runDesktopCheckpointNow(
  checkpoint: CheckpointKind,
  scope: CheckpointWorkerScope
) {
  await createDesktopRepository().getSnapshot();
  if (!checkpointPipeline) {
    throw new Error("The desktop checkpoint pipeline is not initialized.");
  }
  const { run } = await checkpointPipeline.runNow(checkpoint, scope);
  return run;
}

export async function getDesktopActiveSessionDeliveryStatus(): Promise<{
  available: boolean;
  reason?: string;
  settings: HermesNativeDeliveryStatus | null;
}> {
  const invoke = getTauriInvoker();
  if (!invoke) {
    return {
      available: false,
      reason: "Active-session delivery requires the native desktop runtime.",
      settings: null
    };
  }
  const status = await getHermesNativeDeliveryStatus(invoke);
  return {
    available: status.configured,
    ...(!status.configured && status.reason ? { reason: status.reason } : {}),
    settings: status
  };
}

export async function saveDesktopHermesDeliverySettings(
  settings: HermesNativeSettingsInput
): Promise<HermesNativeDeliveryStatus> {
  const invoke = getTauriInvoker();
  if (!invoke) {
    throw new Error("Hermes delivery settings require the native desktop runtime.");
  }
  return saveHermesNativeDeliverySettings(invoke, settings);
}

export async function pushDesktopProposalToActiveSession(input: {
  kind: ActiveSessionProposal["kind"];
  id: string;
  sessionId: string;
  threadId: string;
}) {
  const invoke = getTauriInvoker();
  if (!invoke) {
    throw new Error("Active-session delivery requires the native desktop runtime.");
  }
  const repository = createDesktopRepository();
  const snapshot = await repository.getSnapshot();
  const proposal: ActiveSessionProposal | null =
    input.kind === "Task"
      ? (() => {
          const item = snapshot.tasks.find((task) => task.id === input.id);
          return item ? { kind: "Task" as const, item } : null;
        })()
      : (() => {
          const item = snapshot.guidance.find((guidance) => guidance.id === input.id);
          return item ? { kind: "GuidanceItem" as const, item } : null;
        })();
  if (!proposal) {
    throw new Error("The selected proposal no longer exists.");
  }
  return pushProposalToActiveSession(
    repository,
    createNativeHermesSessionDeliveryAdapter(invoke),
    proposal,
    {
      projectId: proposal.item.projectId,
      sessionId: input.sessionId,
      threadId: input.threadId
    }
  );
}

export function createDesktopRepository(): SubMindRepository {
  if (desktopRepositoryInstance) {
    return desktopRepositoryInstance;
  }

  const previewSnapshot = createPreviewStoreSnapshot();
  let repositoryPromise: Promise<SubMindRepository> | null = null;
  let refreshObservations: (() => Promise<void>) | undefined;

  async function resolveRepository(): Promise<SubMindRepository> {
    if (!repositoryPromise) {
      repositoryPromise = (async () => {
        if (!isTauriRuntime()) {
          return createPreviewRepository(previewSnapshot);
        }

        const { default: Database } = await import("@tauri-apps/plugin-sql");
        const database = await Database.load(subMindSqliteDatabasePath);
        type DesktopDatabase = Parameters<typeof createSqliteRepository>[0]["db"];
        const db: DesktopDatabase = {
          select<T>(query: string, bindValues?: unknown[]) {
            return database.select(query, bindValues) as Promise<T>;
          },
          async execute(query: string, bindValues?: unknown[]) {
            const result = await database.execute(query, bindValues);

            return {
              rowsAffected: result.rowsAffected,
              lastInsertId: result.lastInsertId ?? null
            };
          }
        };

        checkpointPipeline = createCheckpointPipeline({
          debounceMs: 5_000,
          maxDebounceMs: 30_000,
          queue: createSqliteCheckpointTriggerQueue(db),
          onQueueError(error) {
            console.warn(
              "SubMind checkpoint queue write failed:",
              redactSensitiveText(String(error)).value
            );
          },
          getRepository: resolveRepository,
          adapter: createNativeModelWorkerAdapter(
            getTauriInvoker() as TauriInvoke
          ),
          onResult({ run }) {
            if (run.status !== "completed") {
              console.warn(
                `SubMind ${run.checkpoint} checkpoint finished with status ${run.status}.`
              );
            }
          },
          onError(error, checkpoint) {
            console.warn(
              `SubMind ${checkpoint} checkpoint failed:`,
              redactSensitiveText(String(error)).value
            );
          }
        });
        refreshObservations = createObservationRefresh(
          desktopObservationSources(),
          (snapshot) => syncRuntimeSnapshotIntoDatabase(db, snapshot),
          5_000,
          (snapshot) => checkpointPipeline?.observe(snapshot)
        );
        try {
          await refreshObservations();
        } catch (error) {
          console.warn("SubMind observation refresh incomplete:", redactSensitiveText(String(error)).value);
        }

        void checkpointPipeline.restore().catch((error: unknown) => {
          console.warn(
            "SubMind checkpoint queue restore failed:",
            redactSensitiveText(String(error)).value
          );
        });

        return createSqliteRepository({
          db,
          seedSnapshot: previewSnapshot
        });
      })();
    }

    return repositoryPromise;
  }

  const repository: SubMindRepository = {
    async getSnapshot() {
      const repository = await resolveRepository();
      try { await refreshObservations?.(); }
      catch (error) { console.warn("SubMind observation refresh incomplete:", redactSensitiveText(String(error)).value); }
      return repository.getSnapshot();
    },
    async appendEvents(events) {
      return (await resolveRepository()).appendEvents(events);
    },
    async appendGeneratedProposals(batch) {
      return (await resolveRepository()).appendGeneratedProposals(batch);
    },
    async getSettingsConfig() {
      return (await resolveRepository()).getSettingsConfig();
    },
    async updateSettingsConfig(input: SettingsConfigDraft) {
      return (await resolveRepository()).updateSettingsConfig(input);
    },
    async updateProjectWorkspaceAliases(input: ProjectWorkspaceAliasesInput) {
      return (await resolveRepository()).updateProjectWorkspaceAliases(input);
    },
    async searchProjects(input?: ProjectSearchInput) {
      return (await resolveRepository()).searchProjects(input);
    },
    async getProjectExport(input: ProjectExportQueryInput) {
      return (await resolveRepository()).getProjectExport(input);
    },
    async getEventHistory(input?: EventHistoryQueryInput) {
      return (await resolveRepository()).getEventHistory(input);
    },
    async getFileChangeHistory(input?: FileChangeHistoryQueryInput) {
      return (await resolveRepository()).getFileChangeHistory(input);
    },
    async getActionHistory(actionId: string, limit?: number) {
      return (await resolveRepository()).getActionHistory(actionId, limit);
    },
    async transitionAction(input: ActionStateTransitionInput) {
      return (await resolveRepository()).transitionAction(input);
    },
    async updateMemoryItem(input: MemoryCurationInput) {
      return (await resolveRepository()).updateMemoryItem(input);
    },
    async reviewGuidanceItem(input: GuidanceReviewInput) {
      return (await resolveRepository()).reviewGuidanceItem(input);
    },
    async reviewTask(input: TaskReviewInput) {
      return (await resolveRepository()).reviewTask(input);
    },
    async setContextEligibility(input: ContextEligibilityInput) {
      return (await resolveRepository()).setContextEligibility(input);
    },
    async revertProposalReview(input: RevertProposalReviewInput) {
      return (await resolveRepository()).revertProposalReview(input);
    }
  };
  desktopRepositoryInstance = repository;
  return repository;
}

export function createDesktopBootstrap(
  snapshot: SubMindStoreSnapshot,
  repository: SubMindRepository
) {
  const initialUiState = createInitialShellUiState(snapshot);
  const activeProject =
    snapshot.projects.find(
      (project) => project.id === initialUiState.selectedProjectId
    ) ?? null;
  const activeSession = activeProject
    ? getProjectSessions(snapshot, activeProject.id)[0] ?? null
    : null;
  const activeThread = activeSession
    ? getPrimarySessionThread(snapshot, activeSession.id)
    : null;

  return {
    shell: desktopShellManifest,
    initialUiState,
    repository,
    runtime: describeRuntimeContext({
      scope: initialUiState.focusedProjectId ? "project" : "global",
      ...(activeProject ? { project: activeProject } : {}),
      ...(activeSession ? { activeSession } : {}),
      ...(activeThread ? { activeThread } : {})
    }),
    store: snapshot,
    protocol: createWorkTraceEnvelope(snapshot, activeSession?.id, activeThread?.id),
    checkpoints: {
      event: createWorkerPlan("event"),
      thread: createWorkerPlan("thread"),
      session: createWorkerPlan("session"),
      guidance: createWorkerPlan("guidance"),
      action: createWorkerPlan("action")
    },
    availableSubagents: starterSubagents
  };
}

export function createDesktopPreviewBootstrap() {
  const snapshot = createPreviewStoreSnapshot();
  const repository = createPreviewRepository(snapshot);

  return createDesktopBootstrap(snapshot, repository);
}
