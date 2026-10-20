import type { Project, Session, Thread } from "@submind/shared-schemas";
import { getEventHarness, type AgentAdapter } from "@submind/shared-schemas";
import { mergeStoreSnapshots, type SubMindStoreSnapshot } from "@submind/store";

export {
  createCheckpointTriggerCoordinator,
  type CheckpointTriggerCoordinatorOptions,
  type CheckpointTriggerScope
} from "./checkpoint-triggers.js";
export {
  createActiveSessionGeneratedDelivery,
  createCheckpointPipeline,
  type CheckpointPipelineOptions,
  type CheckpointPipelineResult,
  type GeneratedContentDelivery,
  type GeneratedContentDeliveryOutcome
} from "./checkpoint-pipeline.js";
export {
  assertProposalDeliverable,
  pushProposalToActiveSession,
  type ActiveSessionDeliveryAdapter,
  type ActiveSessionDeliveryResult,
  type ActiveSessionProposal,
  type ActiveSessionTarget
} from "./proposal-delivery.js";

export interface AgentObservationSource {
  harnessId: string;
  observe(): Promise<SubMindStoreSnapshot>;
}

export function createAgentObservationSource<Feed>(
  adapter: AgentAdapter<Feed, SubMindStoreSnapshot>,
  load: () => Promise<Feed>
): AgentObservationSource {
  return { harnessId: adapter.harnessId, observe: async () => adapter.normalize(await load()) };
}

/** A failed integration must not hide successful observations from another. */
export async function collectAgentObservations(sources: AgentObservationSource[]) {
  const results = await Promise.allSettled(sources.map(source => source.observe()));
  const snapshots: SubMindStoreSnapshot[] = [];
  const failures: { harnessId: string; reason: string }[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") snapshots.push(result.value);
    else failures.push({ harnessId: sources[index]!.harnessId, reason: String(result.reason) });
  });
  return { snapshot: mergeStoreSnapshots(snapshots), failures };
}

/** Coalesce refreshes; only the host supplies I/O and persistence. */
export function createObservationRefresh(
  sources: AgentObservationSource[],
  persist: (snapshot: SubMindStoreSnapshot) => Promise<void>,
  intervalMs = 5_000,
  onSnapshot?: (snapshot: SubMindStoreSnapshot) => void
) {
  let pending: Promise<void> | undefined;
  let lastRefresh = 0;
  return async function refresh(): Promise<void> {
    if (pending) return pending;
    if (Date.now() - lastRefresh < intervalMs) return;
    pending = (async () => {
      const { snapshot, failures } = await collectAgentObservations(sources);
      if (snapshot.projects.length) {
        await persist(snapshot);
        onSnapshot?.(snapshot);
      }
      lastRefresh = Date.now();
      if (failures.length) throw new Error(failures.map(f => `${f.harnessId}: ${f.reason}`).join("; "));
    })();
    try { await pending; } finally { pending = undefined; }
  };
}

export function createWorkTraceEnvelope(snapshot: SubMindStoreSnapshot, sessionId?: string, threadId?: string) {
  const events = threadId ? snapshot.events.filter(event => event.threadId === threadId && event.sessionId === sessionId) : [];
  return {
    source: "agent_work" as const,
    harnessIds: [...new Set(events.map(getEventHarness).filter((id): id is string => Boolean(id)))],
    sessionId: sessionId ?? "pending-session",
    threadId: threadId ?? "pending-thread",
    events,
    fileChanges: threadId ? snapshot.fileChanges.filter(change => change.threadId === threadId && change.sessionId === sessionId) : []
  };
}

export interface SubMindRuntimeContext {
  scope: "global" | "project";
  project?: Project;
  activeSession?: Session;
  activeThread?: Thread;
}

export function describeRuntimeContext(context: SubMindRuntimeContext) {
  return {
    scope: context.scope,
    projectId: context.project?.id ?? null,
    projectName: context.project?.name ?? null,
    activeSessionId: context.activeSession?.id ?? null,
    activeThreadId: context.activeThread?.id ?? null
  };
}
