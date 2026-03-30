import { describeRuntimeContext } from "@submind/core";
import { starterSubagents } from "@submind/policy";
import { createEmptyCodexProtocolEnvelope } from "@submind/protocol-codex";
import {
  createPreviewRepository,
  createPreviewStoreSnapshot,
  getPrimarySessionThread,
  getProjectSessions,
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
    protocol: createEmptyCodexProtocolEnvelope(
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
