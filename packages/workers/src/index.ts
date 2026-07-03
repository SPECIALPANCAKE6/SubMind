import {
  type ActionItem,
  checkpointKinds,
  type ContextBundle,
  type ContextDatum,
  type ContextDatumKind,
  type ContextInjectionAuditMetadata,
  type ContextRequest,
  type ContextSourceReference,
  type Event,
  type GuidanceItem,
  type Project,
  deterministicWorkerKinds,
  modelWorkerKinds,
  type CheckpointKind,
  type DeterministicWorkerKind,
  type ModelWorkerKind
} from "@submind/shared-schemas";
import {
  fingerprintText,
  redactSensitiveObject,
  redactSensitiveText
} from "@submind/policy";
import {
  getProjectActionItems,
  getProjectById,
  getProjectEvents,
  getProjectFileChanges,
  getProjectGuidanceItems,
  getProjectMemoryItems,
  projectMatchesSearchQuery,
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

const defaultContextMaxItems = 8;
const maximumContextItems = 20;
const defaultContextMaxTokens = 1_200;
const maximumContextTokens = 4_000;
const maximumContextCandidates = 40;
const contextStopWords = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "can",
  "context",
  "for",
  "from",
  "have",
  "into",
  "project",
  "that",
  "the",
  "this",
  "with",
  "what",
  "when",
  "where"
]);

export interface ContextModelInput {
  prompt: string;
  project: Project;
  threadId?: string;
  maxItems: number;
  maxTokens: number;
  candidates: ContextDatum[];
}

export interface ContextModelSelection {
  datumId: string;
  relevanceScore: number;
  rationale: string;
}

export interface ContextModelResult {
  model: string;
  selections: ContextModelSelection[];
  composedContext: string;
}

export interface ContextModelAdapter {
  rankAndCompose(input: ContextModelInput): Promise<ContextModelResult>;
}

export interface CreateContextBundleOptions {
  modelAdapter?: ContextModelAdapter;
  now?: () => string;
}

interface NormalizedContextRequest {
  projectId?: string;
  projectQuery?: string;
  threadId?: string;
  prompt: string;
  maxItems: number;
  maxTokens: number;
  kinds: Set<ContextDatumKind> | null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeContextRequest(request: ContextRequest): NormalizedContextRequest {
  const prompt = request.prompt.trim();

  if (!prompt) {
    throw new Error("ContextRequest.prompt must not be empty.");
  }

  if (prompt.length > 8_000) {
    throw new Error("ContextRequest.prompt must be 8,000 characters or fewer.");
  }

  const maxItems = clamp(
    Math.trunc(request.maxItems ?? defaultContextMaxItems),
    1,
    maximumContextItems
  );
  const maxTokens = clamp(
    Math.trunc(request.maxTokens ?? defaultContextMaxTokens),
    128,
    maximumContextTokens
  );

  return {
    ...(request.projectId?.trim()
      ? { projectId: request.projectId.trim() }
      : {}),
    ...(request.projectQuery?.trim()
      ? { projectQuery: request.projectQuery.trim() }
      : {}),
    ...(request.threadId?.trim() ? { threadId: request.threadId.trim() } : {}),
    prompt,
    maxItems,
    maxTokens,
    kinds:
      request.kinds && request.kinds.length > 0
        ? new Set(request.kinds)
        : null
  };
}

function resolveContextProject(
  snapshot: SubMindStoreSnapshot,
  request: NormalizedContextRequest
): Project {
  const project = request.projectId
    ? getProjectById(snapshot, request.projectId)
    : request.projectQuery
      ? snapshot.projects.find((item) =>
          projectMatchesSearchQuery(item, request.projectQuery)
        ) ?? null
      : null;

  if (!project) {
    throw new Error("ContextRequest must identify an existing project.");
  }

  if (
    request.threadId &&
    !snapshot.threads.some(
      (thread) =>
        thread.id === request.threadId && thread.projectId === project.id
    )
  ) {
    throw new Error("ContextRequest.threadId does not belong to the project.");
  }

  return project;
}

function tokenizeContextText(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9_./-]+/)
      .map((token) => token.trim())
      .filter(
        (token) =>
          token.length >= 3 && !contextStopWords.has(token)
      )
  );
}

function calculateKeywordScore(
  promptTokens: Set<string>,
  title: string,
  content: string
): number {
  if (promptTokens.size === 0) {
    return 0;
  }

  const candidateTokens = tokenizeContextText(`${title} ${content}`);
  let matches = 0;

  for (const token of promptTokens) {
    if (candidateTokens.has(token)) {
      matches += 1;
    }
  }

  return clamp(matches / promptTokens.size, 0, 1);
}

function calculateTimestampFreshness(timestamp: string, now: string): number {
  const ageMs = Math.max(0, Date.parse(now) - Date.parse(timestamp));

  if (!Number.isFinite(ageMs)) {
    return 0.5;
  }

  const ageDays = ageMs / (24 * 60 * 60 * 1_000);
  return clamp(1 - ageDays / 90, 0.1, 1);
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function createContextDatum(
  input: {
    id: string;
    kind: ContextDatumKind;
    projectId: string;
    threadId?: string;
    title: string;
    content: string;
    confidence: number;
    freshness: number;
    baseScore: number;
    sources: ContextSourceReference[];
  },
  promptTokens: Set<string>,
  requestedThreadId: string | undefined
): ContextDatum {
  const redactedTitle = redactSensitiveText(input.title);
  const redactedContent = redactSensitiveText(input.content);
  const keywordScore = calculateKeywordScore(
    promptTokens,
    redactedTitle.value,
    redactedContent.value
  );
  const threadBoost =
    requestedThreadId && input.threadId === requestedThreadId ? 0.18 : 0;
  const deterministicScore = clamp(
    input.baseScore + keywordScore * 0.3 + threadBoost,
    0,
    1
  );
  const sensitivity =
    redactedTitle.redactionCount + redactedContent.redactionCount > 0
      ? "protected_redacted"
      : "normal";

  return {
    id: input.id,
    kind: input.kind,
    projectId: input.projectId,
    ...(input.threadId ? { threadId: input.threadId } : {}),
    title: redactedTitle.value,
    content: redactedContent.value,
    confidence: clamp(input.confidence, 0, 1),
    freshness: clamp(input.freshness, 0, 1),
    sensitivity,
    deterministicScore,
    relevanceScore: deterministicScore,
    relevanceRationale: "Selected by deterministic policy and scope relevance.",
    estimatedTokens: estimateTokens(
      `${redactedTitle.value}\n${redactedContent.value}`
    ),
    sources: input.sources
  };
}

function contextKindIsEnabled(
  request: NormalizedContextRequest,
  kind: ContextDatumKind
): boolean {
  return !request.kinds || request.kinds.has(kind);
}

export function createContextCandidates(
  snapshot: SubMindStoreSnapshot,
  request: ContextRequest,
  now = new Date().toISOString()
): ContextDatum[] {
  const normalizedRequest = normalizeContextRequest(request);
  const project = resolveContextProject(snapshot, normalizedRequest);
  const promptTokens = tokenizeContextText(normalizedRequest.prompt);
  const candidates: ContextDatum[] = [];

  if (contextKindIsEnabled(normalizedRequest, "project_context")) {
    candidates.push(
      createContextDatum(
        {
          id: `context-project-${project.id}`,
          kind: "project_context",
          projectId: project.id,
          title: project.name,
          content: [
            project.description,
            project.summary,
            project.descriptors.join(", ")
          ]
            .filter(Boolean)
            .join(". "),
          confidence: 1,
          freshness: calculateTimestampFreshness(project.updatedAt, now),
          baseScore: 0.58,
          sources: [
            {
              entityType: "Project",
              entityId: project.id,
              label: project.name
            }
          ]
        },
        promptTokens,
        normalizedRequest.threadId
      )
    );
  }

  if (contextKindIsEnabled(normalizedRequest, "memory")) {
    const memoryItems = [
      ...getProjectMemoryItems(snapshot, project.id),
      ...getProjectMemoryItems(snapshot, null)
    ].filter(
      (item) =>
        !["archived", "superseded", "draft"].includes(item.status)
    );

    for (const item of memoryItems) {
      const curationBoost =
        item.curationState === "confirmed" || item.curationState === "edited"
          ? 0.08
          : 0;
      const pinnedBoost = item.isPinned ? 0.08 : 0;

      candidates.push(
        createContextDatum(
          {
            id: `context-memory-${item.id}`,
            kind: "memory",
            projectId: project.id,
            ...(item.threadId ? { threadId: item.threadId } : {}),
            title: item.summary,
            content: item.content,
            confidence: item.confidence,
            freshness: item.freshness,
            baseScore:
              0.28 +
              item.confidence * 0.14 +
              item.freshness * 0.12 +
              curationBoost +
              pinnedBoost,
            sources: [
              {
                entityType: "MemoryItem",
                entityId: item.id,
                label: item.summary
              },
              ...item.sourceEventIds.map((eventId) => ({
                entityType: "Event" as const,
                entityId: eventId,
                label: "Memory evidence event"
              })),
              ...item.sourceFileChangeIds.map((fileChangeId) => ({
                entityType: "FileChange" as const,
                entityId: fileChangeId,
                label: "Memory evidence file"
              }))
            ]
          },
          promptTokens,
          normalizedRequest.threadId
        )
      );
    }
  }

  if (contextKindIsEnabled(normalizedRequest, "guidance")) {
    for (const item of getProjectGuidanceItems(snapshot, project.id).filter(
      (guidanceItem) =>
        !["suppressed", "resolved"].includes(guidanceItem.state)
    )) {
      const stateBoost = item.state === "injected" ? 0.12 : 0.05;

      candidates.push(
        createContextDatum(
          {
            id: `context-guidance-${item.id}`,
            kind: "guidance",
            projectId: project.id,
            ...(item.threadId ? { threadId: item.threadId } : {}),
            title: item.title,
            content: `${item.summary} ${item.rationale}`,
            confidence: item.confidence,
            freshness: calculateTimestampFreshness(item.updatedAt, now),
            baseScore: 0.34 + item.confidence * 0.16 + stateBoost,
            sources: [
              {
                entityType: "GuidanceItem",
                entityId: item.id,
                label: item.title
              },
              ...item.linkedEventIds.map((eventId) => ({
                entityType: "Event" as const,
                entityId: eventId,
                label: "Guidance evidence event"
              }))
            ]
          },
          promptTokens,
          normalizedRequest.threadId
        )
      );
    }
  }

  if (contextKindIsEnabled(normalizedRequest, "pending_action")) {
    for (const item of getProjectActionItems(snapshot, project.id).filter(
      (actionItem) =>
        ["pending", "in_progress", "blocked"].includes(actionItem.state)
    )) {
      const riskBoost =
        item.riskLevel === "critical"
          ? 0.16
          : item.riskLevel === "high"
            ? 0.12
            : item.riskLevel === "medium"
              ? 0.06
              : 0;

      candidates.push(
        createContextDatum(
          {
            id: `context-action-${item.id}`,
            kind: "pending_action",
            projectId: project.id,
            ...(item.threadId ? { threadId: item.threadId } : {}),
            title: item.title,
            content: [
              item.summary,
              item.riskSummary,
              item.expectedOutcome
            ]
              .filter(Boolean)
              .join(" "),
            confidence: item.owner === "operator" ? 0.95 : 0.78,
            freshness: calculateTimestampFreshness(item.updatedAt, now),
            baseScore: 0.36 + riskBoost,
            sources: [
              {
                entityType: "ActionItem",
                entityId: item.id,
                label: item.title
              }
            ]
          },
          promptTokens,
          normalizedRequest.threadId
        )
      );
    }
  }

  if (contextKindIsEnabled(normalizedRequest, "recent_change")) {
    for (const item of getProjectFileChanges(snapshot, project.id).slice(0, 12)) {
      candidates.push(
        createContextDatum(
          {
            id: `context-file-${item.id}`,
            kind: "recent_change",
            projectId: project.id,
            ...(item.threadId ? { threadId: item.threadId } : {}),
            title: item.path,
            content: item.summary ?? `${item.changeType} ${item.path}`,
            confidence: 0.9,
            freshness: calculateTimestampFreshness(item.updatedAt, now),
            baseScore:
              0.3 + calculateTimestampFreshness(item.updatedAt, now) * 0.16,
            sources: [
              {
                entityType: "FileChange",
                entityId: item.id,
                label: item.path
              },
              {
                entityType: "Event",
                entityId: item.eventId,
                label: "File change event"
              }
            ]
          },
          promptTokens,
          normalizedRequest.threadId
        )
      );
    }

    for (const item of getProjectEvents(snapshot, project.id)
      .filter((event) => event.category === "work_change")
      .slice(0, 8)) {
      candidates.push(
        createContextDatum(
          {
            id: `context-event-${item.id}`,
            kind: "recent_change",
            projectId: project.id,
            ...(item.threadId ? { threadId: item.threadId } : {}),
            title: item.eventType,
            content: item.summary,
            confidence: 0.82,
            freshness: calculateTimestampFreshness(item.timestamp, now),
            baseScore:
              0.26 + calculateTimestampFreshness(item.timestamp, now) * 0.14,
            sources: [
              {
                entityType: "Event",
                entityId: item.id,
                label: item.summary
              }
            ]
          },
          promptTokens,
          normalizedRequest.threadId
        )
      );
    }
  }

  return candidates
    .sort(
      (left, right) =>
        right.deterministicScore - left.deterministicScore ||
        left.id.localeCompare(right.id)
    )
    .slice(0, maximumContextCandidates);
}

function selectWithinContextBudget(
  items: ContextDatum[],
  maxItems: number,
  maxTokens: number
): ContextDatum[] {
  const selected: ContextDatum[] = [];
  let tokenTotal = 0;

  for (const item of items) {
    if (selected.length >= maxItems) {
      break;
    }

    if (selected.length > 0 && tokenTotal + item.estimatedTokens > maxTokens) {
      continue;
    }

    selected.push(item);
    tokenTotal += item.estimatedTokens;
  }

  return selected;
}

function composeContext(items: ContextDatum[]): string {
  return items
    .map(
      (item) =>
        `- [${item.kind}] ${item.title}: ${item.content} (sources: ${item.sources
          .map((source) => `${source.entityType}:${source.entityId}`)
          .join(", ")})`
    )
    .join("\n");
}

function applyModelResult(
  candidates: ContextDatum[],
  result: ContextModelResult
): ContextDatum[] {
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.id, candidate])
  );
  const seen = new Set<string>();
  const ranked: ContextDatum[] = [];

  for (const selection of result.selections) {
    const candidate = candidatesById.get(selection.datumId);

    if (!candidate || seen.has(candidate.id)) {
      continue;
    }

    seen.add(candidate.id);
    ranked.push({
      ...candidate,
      relevanceScore: clamp(selection.relevanceScore, 0, 1),
      relevanceRationale:
        redactSensitiveText(selection.rationale).value ||
        "Ranked by the configured context model."
    });
  }

  return ranked.sort(
    (left, right) =>
      right.relevanceScore - left.relevanceScore ||
      right.deterministicScore - left.deterministicScore
  );
}

export async function createContextBundle(
  snapshot: SubMindStoreSnapshot,
  request: ContextRequest,
  options: CreateContextBundleOptions = {}
): Promise<ContextBundle> {
  const normalizedRequest = normalizeContextRequest(request);
  const project = resolveContextProject(snapshot, normalizedRequest);
  const generatedAt = options.now?.() ?? new Date().toISOString();
  const candidates = createContextCandidates(snapshot, request, generatedAt);
  const redactedPrompt = redactSensitiveText(normalizedRequest.prompt).value;
  let rankingMode: ContextBundle["ranking"]["mode"] =
    "deterministic_fallback";
  let rankingReason = "No context model adapter was configured.";
  let model: string | undefined;
  let rankedCandidates = candidates;
  let modelComposition = "";

  if (options.modelAdapter && candidates.length > 0) {
    try {
      const result = await options.modelAdapter.rankAndCompose({
        prompt: redactedPrompt,
        project: redactSensitiveObject(project),
        ...(normalizedRequest.threadId
          ? { threadId: normalizedRequest.threadId }
          : {}),
        maxItems: normalizedRequest.maxItems,
        maxTokens: normalizedRequest.maxTokens,
        candidates
      });
      const modelRanked = applyModelResult(candidates, result);

      if (modelRanked.length > 0) {
        rankingMode = "model";
        rankingReason = "Ranked and composed by the configured context model.";
        model = result.model;
        rankedCandidates = modelRanked;
        modelComposition = redactSensitiveText(result.composedContext).value;
      } else {
        rankingReason = "The context model returned no valid candidate IDs.";
      }
    } catch {
      rankingReason = "The context model failed; deterministic ranking was used.";
    }
  }

  const items = selectWithinContextBudget(
    rankedCandidates,
    normalizedRequest.maxItems,
    normalizedRequest.maxTokens
  );
  const deterministicComposition = composeContext(items);
  const composedContext =
    rankingMode === "model" && modelComposition.trim()
      ? modelComposition.trim()
      : deterministicComposition;
  const promptFingerprint = fingerprintText(redactedPrompt);
  const bundleFingerprint = fingerprintText(
    `${project.id}:${normalizedRequest.threadId ?? "project"}:${promptFingerprint}:${generatedAt}`
  );

  return {
    kind: "ContextBundle",
    apiVersion: "v1",
    bundleId: `context-bundle-${bundleFingerprint}`,
    generatedAt,
    project: redactSensitiveObject(project),
    ...(normalizedRequest.threadId
      ? { threadId: normalizedRequest.threadId }
      : {}),
    prompt: {
      fingerprint: promptFingerprint,
      summary: `Context request for ${project.name} (${redactedPrompt.length} characters).`
    },
    limits: {
      maxItems: normalizedRequest.maxItems,
      maxTokens: normalizedRequest.maxTokens
    },
    ranking: {
      mode: rankingMode,
      ...(model ? { model } : {}),
      reason: rankingReason
    },
    items,
    composedContext,
    estimatedTokens: estimateTokens(composedContext),
    omittedCount: Math.max(0, candidates.length - items.length),
    auditEventId: `event-context-supplied-${bundleFingerprint}`
  };
}

export function createContextInjectionAuditEvent(
  bundle: ContextBundle
): Event {
  const sources = bundle.items.flatMap((item) => item.sources);
  const firstMemory = sources.find(
    (source) => source.entityType === "MemoryItem"
  );
  const firstGuidance = sources.find(
    (source) => source.entityType === "GuidanceItem"
  );
  const firstAction = sources.find(
    (source) => source.entityType === "ActionItem"
  );
  const firstFileChange = sources.find(
    (source) => source.entityType === "FileChange"
  );
  const metadata: ContextInjectionAuditMetadata = {
    bundleId: bundle.bundleId,
    promptFingerprint: bundle.prompt.fingerprint,
    rankingMode: bundle.ranking.mode,
    ...(bundle.ranking.model ? { model: bundle.ranking.model } : {}),
    contextDatumIds: bundle.items.map((item) => item.id),
    sources,
    suppliedItems: bundle.items,
    composedContext: bundle.composedContext,
    estimatedTokens: bundle.estimatedTokens,
    omittedCount: bundle.omittedCount
  };

  return {
    kind: "Event",
    id: bundle.auditEventId,
    projectId: bundle.project.id,
    ...(bundle.threadId ? { threadId: bundle.threadId } : {}),
    ...(firstMemory ? { memoryItemId: firstMemory.entityId } : {}),
    ...(firstGuidance ? { guidanceItemId: firstGuidance.entityId } : {}),
    ...(firstAction ? { actionItemId: firstAction.entityId } : {}),
    ...(firstFileChange ? { fileChangeId: firstFileChange.entityId } : {}),
    originType: "submind",
    eventType: "context_bundle_supplied",
    category: "guidance",
    nodeCategory: "cognitive",
    timestamp: bundle.generatedAt,
    summary: `SubMind supplied ${bundle.items.length} context data points for ${bundle.project.name}.`,
    metadata: metadata as unknown as Record<string, unknown>,
    createdAt: bundle.generatedAt,
    updatedAt: bundle.generatedAt
  };
}
