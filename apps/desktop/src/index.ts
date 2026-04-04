import { describeRuntimeContext } from "@submind/core";
import { starterSubagents } from "@submind/policy";
import {
  createCodexProtocolEnvelope,
  createEmptyCodexProtocolEnvelope,
  createStoreSnapshotFromCodexRuntimeFeed,
  type CodexRuntimeFeed
} from "@submind/protocol-codex";
import {
  type ActionStateTransitionInput,
  type EventHistoryQueryInput,
  type FileChangeHistoryQueryInput,
  createPreviewRepository,
  createSqliteRepository,
  createPreviewStoreSnapshot,
  getPrimarySessionThread,
  getProjectSessions,
  syncRuntimeSnapshotIntoDatabase,
  subMindSqliteDatabasePath,
  type SubMindRepository,
  type SubMindStoreSnapshot
} from "@submind/store";
import {
  createInitialShellUiState,
  layoutModes,
  primaryScreens
} from "@submind/ui-state";
import { createWorkerPlan } from "@submind/workers";

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

async function loadCodexRuntimeSnapshot(): Promise<SubMindStoreSnapshot | null> {
  const invoke = getTauriInvoker();

  if (!invoke) {
    return null;
  }

  const feed = await invoke<CodexRuntimeFeed>("load_codex_runtime_feed", {
    limit: 24
  });

  if (!feed.threads.length) {
    return null;
  }

  return createStoreSnapshotFromCodexRuntimeFeed(feed);
}

export function createDesktopRepository(): SubMindRepository {
  const previewSnapshot = createPreviewStoreSnapshot();
  let repositoryPromise: Promise<SubMindRepository> | null = null;

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

        try {
          const runtimeSnapshot = await loadCodexRuntimeSnapshot();

          if (runtimeSnapshot) {
            await syncRuntimeSnapshotIntoDatabase(db, runtimeSnapshot);
          }
        } catch (error) {
          console.warn("SubMind fell back to preview snapshot seed.", error);
        }

        return createSqliteRepository({
          db,
          seedSnapshot: previewSnapshot
        });
      })();
    }

    return repositoryPromise;
  }

  return {
    async getSnapshot() {
      return (await resolveRepository()).getSnapshot();
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
    }
  };
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
    protocol:
      activeSession && activeThread
        ? createCodexProtocolEnvelope(snapshot, activeSession.id, activeThread.id)
        : createEmptyCodexProtocolEnvelope(
            activeSession?.id ?? "pending-session",
            activeThread?.id ?? "pending-thread",
            activeThread?.updatedAt ??
              activeSession?.updatedAt ??
              activeProject?.updatedAt ??
              new Date().toISOString()
          ),
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
