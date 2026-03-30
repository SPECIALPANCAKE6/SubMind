import {
  type ActionItem,
  checkpointKinds,
  type GuidanceItem,
  deterministicWorkerKinds,
  modelWorkerKinds,
  type CheckpointKind,
  type DeterministicWorkerKind,
  type ModelWorkerKind
} from "@submind/shared-schemas";
import {
  getProjectActionItems,
  getProjectGuidanceItems,
  getProjectMemoryItems,
  type SubMindStoreSnapshot
} from "@submind/store";

export interface WorkerPlan {
  checkpoint: CheckpointKind;
  deterministic: DeterministicWorkerKind[];
  model: ModelWorkerKind[];
}

export interface GuidanceCheckpointSummary {
  guidanceCount: number;
  injectedCount: number;
  candidateCount: number;
  suppressedCount: number;
  resolvedCount: number;
  linkedMemoryCount: number;
  relatedActionCount: number;
  highRiskActionCount: number;
  dominantSource: GuidanceItem["source"] | "none";
  recommendedTitle: string;
  recommendedBody: string;
}

export interface ActionCheckpointSummary {
  actionCount: number;
  openCount: number;
  pendingCount: number;
  inProgressCount: number;
  blockedCount: number;
  approvedCount: number;
  rejectedCount: number;
  resolvedCount: number;
  highRiskCount: number;
  operatorOwnedCount: number;
  relatedGuidanceCount: number;
  relatedMemoryCount: number;
  relatedFileChangeCount: number;
  recommendedTitle: string;
  recommendedBody: string;
}

const defaultDeterministicWorkers = [...deterministicWorkerKinds];

const eventCheckpointModelWorkers: ModelWorkerKind[] = ["extraction"];
const threadCheckpointModelWorkers: ModelWorkerKind[] = [
  "summarization",
  "linking"
];
const sessionCheckpointModelWorkers: ModelWorkerKind[] = [
  "summarization",
  "ranking",
  "composition"
];
const guidanceCheckpointModelWorkers: ModelWorkerKind[] = [
  "ranking",
  "composition"
];
const actionCheckpointModelWorkers: ModelWorkerKind[] = [
  "extraction",
  "ranking"
];

export function createWorkerPlan(checkpoint: CheckpointKind): WorkerPlan {
  switch (checkpoint) {
    case "event":
      return {
        checkpoint,
        deterministic: defaultDeterministicWorkers,
        model: eventCheckpointModelWorkers
      };
    case "thread":
      return {
        checkpoint,
        deterministic: defaultDeterministicWorkers,
        model: threadCheckpointModelWorkers
      };
    case "session":
      return {
        checkpoint,
        deterministic: defaultDeterministicWorkers,
        model: sessionCheckpointModelWorkers
      };
    case "guidance":
      return {
        checkpoint,
        deterministic: defaultDeterministicWorkers,
        model: guidanceCheckpointModelWorkers
      };
    case "action":
      return {
        checkpoint,
        deterministic: defaultDeterministicWorkers,
        model: actionCheckpointModelWorkers
      };
    default:
      return {
        checkpoint,
        deterministic: defaultDeterministicWorkers,
        model: []
      };
  }
}

export const supportedCheckpoints = checkpointKinds;

function getGuidanceScopeItems(
  snapshot: SubMindStoreSnapshot,
  projectId: string | null
): GuidanceItem[] {
  return projectId ? getProjectGuidanceItems(snapshot, projectId) : snapshot.guidance;
}

function getActionScopeItems(
  snapshot: SubMindStoreSnapshot,
  projectId: string | null
): ActionItem[] {
  return projectId ? getProjectActionItems(snapshot, projectId) : snapshot.actions;
}

export function createGuidanceCheckpointSummary(
  snapshot: SubMindStoreSnapshot,
  projectId: string | null = null
): GuidanceCheckpointSummary {
  const guidanceItems = getGuidanceScopeItems(snapshot, projectId);
  const relatedActions = projectId
    ? getProjectActionItems(snapshot, projectId)
    : snapshot.actions;
  const relatedMemory = projectId
    ? [
        ...getProjectMemoryItems(snapshot, projectId),
        ...getProjectMemoryItems(snapshot, null)
      ]
    : snapshot.memory;
  const sourceCounts: Record<GuidanceItem["source"], number> = {
    operator: 0,
    policy: 0,
    system: 0,
    model: 0
  };
  let injectedCount = 0;
  let candidateCount = 0;
  let suppressedCount = 0;
  let resolvedCount = 0;
  let linkedMemoryCount = 0;

  for (const guidanceItem of guidanceItems) {
    sourceCounts[guidanceItem.source] += 1;
    linkedMemoryCount += guidanceItem.linkedMemoryItemIds.length;

    switch (guidanceItem.state) {
      case "injected":
        injectedCount += 1;
        break;
      case "candidate":
        candidateCount += 1;
        break;
      case "suppressed":
        suppressedCount += 1;
        break;
      case "resolved":
        resolvedCount += 1;
        break;
      default:
        break;
    }
  }

  const highRiskActionCount = relatedActions.filter((actionItem) =>
    ["high", "critical"].includes(actionItem.riskLevel)
  ).length;
  const dominantSourceEntry = Object.entries(sourceCounts).sort(
    (left, right) => right[1] - left[1]
  )[0];
  const dominantSource =
    dominantSourceEntry && dominantSourceEntry[1] > 0
      ? (dominantSourceEntry[0] as GuidanceItem["source"])
      : "none";

  const recommendedTitle =
    injectedCount > 0
      ? `${injectedCount} injected / ${candidateCount} candidate`
      : candidateCount > 0
        ? `${candidateCount} candidate interventions waiting`
        : guidanceItems.length > 0
          ? `${guidanceItems.length} guidance packages tracked`
          : "Guidance surface is quiet";
  const recommendedBody =
    highRiskActionCount > 0
      ? `${highRiskActionCount} high-risk actions are raising intervention pressure, so guidance should stay operator-visible.`
      : linkedMemoryCount > 0
        ? `Guidance is anchored by ${linkedMemoryCount} linked memory references across ${relatedMemory.length} visible memory items.`
        : guidanceItems.length > 0
          ? `Guidance exists, but the current scope is carrying low action pressure and lighter memory coupling.`
          : "No current guidance packages are active in this scope yet.";

  return {
    guidanceCount: guidanceItems.length,
    injectedCount,
    candidateCount,
    suppressedCount,
    resolvedCount,
    linkedMemoryCount,
    relatedActionCount: relatedActions.length,
    highRiskActionCount,
    dominantSource,
    recommendedTitle,
    recommendedBody
  };
}

export function createActionCheckpointSummary(
  snapshot: SubMindStoreSnapshot,
  projectId: string | null = null
): ActionCheckpointSummary {
  const actionItems = getActionScopeItems(snapshot, projectId);
  const relatedGuidance = projectId
    ? getProjectGuidanceItems(snapshot, projectId)
    : snapshot.guidance;
  const relatedMemory = projectId
    ? [
        ...getProjectMemoryItems(snapshot, projectId),
        ...getProjectMemoryItems(snapshot, null)
      ]
    : snapshot.memory;
  const relatedFileChanges = projectId
    ? snapshot.fileChanges.filter((fileChange) => fileChange.projectId === projectId)
    : snapshot.fileChanges;
  let pendingCount = 0;
  let inProgressCount = 0;
  let blockedCount = 0;
  let approvedCount = 0;
  let rejectedCount = 0;
  let resolvedCount = 0;

  for (const actionItem of actionItems) {
    switch (actionItem.state) {
      case "pending":
        pendingCount += 1;
        break;
      case "in_progress":
        inProgressCount += 1;
        break;
      case "blocked":
        blockedCount += 1;
        break;
      case "approved":
        approvedCount += 1;
        break;
      case "rejected":
        rejectedCount += 1;
        break;
      case "resolved":
        resolvedCount += 1;
        break;
      default:
        break;
    }
  }

  const openCount = pendingCount + inProgressCount + blockedCount;
  const highRiskCount = actionItems.filter((actionItem) =>
    ["high", "critical"].includes(actionItem.riskLevel)
  ).length;
  const operatorOwnedCount = actionItems.filter(
    (actionItem) => actionItem.owner === "operator"
  ).length;
  const recommendedTitle =
    openCount > 0
      ? `${openCount} open / ${highRiskCount} high-risk`
      : actionItems.length > 0
        ? `${resolvedCount} resolved / audit trail ready`
        : "Action queue is quiet";
  const recommendedBody =
    highRiskCount > 0
      ? `${highRiskCount} high-risk actions need explicit operator control before outcome drift grows.`
      : blockedCount > 0
        ? `${blockedCount} blocked actions are holding the control loop and should be reopened or closed cleanly.`
        : openCount > 0
          ? `${pendingCount} pending and ${inProgressCount} in progress, with queue pressure active but not yet critical.`
          : actionItems.length > 0
            ? `Recent actions are mostly in audit posture with ${relatedFileChanges.length} related file changes still visible.`
            : "No action-worthy conditions are active in this scope yet.";

  return {
    actionCount: actionItems.length,
    openCount,
    pendingCount,
    inProgressCount,
    blockedCount,
    approvedCount,
    rejectedCount,
    resolvedCount,
    highRiskCount,
    operatorOwnedCount,
    relatedGuidanceCount: relatedGuidance.length,
    relatedMemoryCount: relatedMemory.length,
    relatedFileChangeCount: relatedFileChanges.length,
    recommendedTitle,
    recommendedBody
  };
}
