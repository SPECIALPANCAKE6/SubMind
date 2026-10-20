import type {
  ActionItem,
  CheckpointKind,
  Event,
  FileChange,
  GuidanceItem,
  MemoryItem,
  ModelWorkerKind,
  Project,
  Session,
  Task,
  Thread
} from "@submind/shared-schemas";
import {
  fingerprintText,
  redactSensitiveObject,
  redactSensitiveText
} from "@submind/policy";
import type { SubMindStoreSnapshot } from "@submind/store";

import { createWorkerPlan } from "./worker-plan.js";

const maximumRecordsPerKind = 60;

export interface CheckpointWorkerScope {
  projectId?: string;
  sessionId?: string;
  threadId?: string;
  eventId?: string;
  actionId?: string;
}

export interface CheckpointWorkerContext {
  project: Project;
  sessions: Session[];
  threads: Thread[];
  tasks: Task[];
  events: Event[];
  fileChanges: FileChange[];
  memory: MemoryItem[];
  guidance: GuidanceItem[];
  actions: ActionItem[];
}

export interface ModelWorkerInvocation {
  checkpoint: CheckpointKind;
  worker: ModelWorkerKind;
  scope: CheckpointWorkerScope;
  context: CheckpointWorkerContext;
  priorResults: Partial<Record<ModelWorkerKind, unknown>>;
}

export interface ModelWorkerResponse {
  model: string;
  output: Record<string, unknown>;
}

export interface ModelWorkerAdapter {
  execute(input: ModelWorkerInvocation): Promise<ModelWorkerResponse>;
}

export type NativeModelWorkerInvoke = <T>(
  command: string,
  payload: Record<string, unknown>
) => Promise<T>;

export interface ModelWorkerExecution {
  worker: ModelWorkerKind;
  status: "completed" | "failed";
  model?: string;
  output?: Record<string, unknown>;
  error?: string;
}

export interface CheckpointWorkerRun {
  checkpoint: CheckpointKind;
  projectId: string;
  scope: CheckpointWorkerScope;
  status: "completed" | "partial" | "failed";
  startedAt: string;
  completedAt: string;
  executions: ModelWorkerExecution[];
}

export interface GeneratedCheckpointProposals {
  tasks: Task[];
  memory: MemoryItem[];
  guidance: GuidanceItem[];
  rejected: Array<{
    kind: "task" | "memory" | "guidance";
    reason: string;
  }>;
}

export interface ExecuteCheckpointModelWorkersOptions {
  checkpoint: CheckpointKind;
  scope: CheckpointWorkerScope;
  adapter: ModelWorkerAdapter;
  now?: () => string;
}

export function createNativeModelWorkerAdapter(
  invoke: NativeModelWorkerInvoke
): ModelWorkerAdapter {
  return {
    execute(input) {
      return invoke<ModelWorkerResponse>("execute_model_worker", {
        checkpoint: input.checkpoint,
        worker: input.worker,
        scope: input.scope,
        context: input.context,
        priorResults: input.priorResults
      });
    }
  };
}

function recentFirst<T extends { updatedAt: string }>(items: T[]): T[] {
  return [...items]
    .sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
    )
    .slice(0, maximumRecordsPerKind);
}

function resolveProjectId(
  snapshot: SubMindStoreSnapshot,
  scope: CheckpointWorkerScope
): string {
  const inferredProjectId =
    scope.projectId ??
    (scope.threadId
      ? snapshot.threads.find((item) => item.id === scope.threadId)?.projectId
      : undefined) ??
    (scope.sessionId
      ? snapshot.sessions.find((item) => item.id === scope.sessionId)?.projectId
      : undefined) ??
    (scope.eventId
      ? snapshot.events.find((item) => item.id === scope.eventId)?.projectId
      : undefined) ??
    (scope.actionId
      ? snapshot.actions.find((item) => item.id === scope.actionId)?.projectId
      : undefined);

  if (!inferredProjectId || !snapshot.projects.some((item) => item.id === inferredProjectId)) {
    throw new Error("Checkpoint execution must identify an existing project or project-owned record.");
  }

  const session = scope.sessionId
    ? snapshot.sessions.find((item) => item.id === scope.sessionId)
    : undefined;
  const thread = scope.threadId
    ? snapshot.threads.find((item) => item.id === scope.threadId)
    : undefined;
  const event = scope.eventId
    ? snapshot.events.find((item) => item.id === scope.eventId)
    : undefined;
  const action = scope.actionId
    ? snapshot.actions.find((item) => item.id === scope.actionId)
    : undefined;

  if (
    (scope.sessionId && !session) ||
    (scope.threadId && !thread) ||
    (scope.eventId && !event) ||
    (scope.actionId && !action)
  ) {
    throw new Error("Checkpoint execution scope contains an unknown record.");
  }

  if (
    [session?.projectId, thread?.projectId, event?.projectId, action?.projectId]
      .some((projectId) => projectId !== undefined && projectId !== inferredProjectId)
  ) {
    throw new Error("Checkpoint execution scope contains records from different projects.");
  }

  if (
    (session && thread && thread.sessionId !== session.id) ||
    (thread && event && event.threadId !== thread.id) ||
    (session && event && event.sessionId !== undefined && event.sessionId !== session.id) ||
    (session && action && action.sessionId !== undefined && action.sessionId !== session.id) ||
    (thread && action && action.threadId !== undefined && action.threadId !== thread.id)
  ) {
    throw new Error("Checkpoint execution scope contains incompatible session or thread records.");
  }

  return inferredProjectId;
}

function createCheckpointWorkerContext(
  snapshot: SubMindStoreSnapshot,
  scope: CheckpointWorkerScope
): CheckpointWorkerContext {
  const projectId = resolveProjectId(snapshot, scope);
  const project = snapshot.projects.find((item) => item.id === projectId);

  if (!project) {
    throw new Error("Checkpoint project could not be resolved.");
  }

  const sessions = snapshot.sessions.filter(
    (item) =>
      item.projectId === projectId &&
      (!scope.sessionId || item.id === scope.sessionId)
  );
  const sessionIds = new Set(sessions.map((item) => item.id));
  const threads = snapshot.threads.filter(
    (item) =>
      item.projectId === projectId &&
      (!scope.sessionId || sessionIds.has(item.sessionId)) &&
      (!scope.threadId || item.id === scope.threadId)
  );
  const threadIds = new Set(threads.map((item) => item.id));
  const tasks = snapshot.tasks.filter(
    (item) =>
      item.projectId === projectId &&
      (!scope.sessionId || item.sessionId === scope.sessionId) &&
      (!scope.threadId || threadIds.has(item.threadId))
  );
  const events = snapshot.events.filter(
    (item) =>
      item.projectId === projectId &&
      (!scope.sessionId || item.sessionId === scope.sessionId) &&
      (!scope.threadId || item.threadId === scope.threadId) &&
      (!scope.eventId || item.id === scope.eventId)
  );
  const fileChanges = snapshot.fileChanges.filter(
    (item) =>
      item.projectId === projectId &&
      (!scope.sessionId || item.sessionId === scope.sessionId) &&
      (!scope.threadId || item.threadId === scope.threadId)
  );
  const memory = snapshot.memory.filter(
    (item) =>
      item.projectId === projectId || item.projectId === undefined
  );
  const guidance = snapshot.guidance.filter(
    (item) =>
      item.projectId === projectId &&
      (!scope.threadId || item.threadId === undefined || item.threadId === scope.threadId)
  );
  const actions = snapshot.actions.filter(
    (item) =>
      item.projectId === projectId &&
      (!scope.threadId || item.threadId === undefined || item.threadId === scope.threadId) &&
      (!scope.actionId || item.id === scope.actionId)
  );

  return redactSensitiveObject({
    project,
    sessions: recentFirst(sessions),
    threads: recentFirst(threads),
    tasks: recentFirst(tasks),
    events: recentFirst(events),
    fileChanges: recentFirst(fileChanges),
    memory: recentFirst(memory),
    guidance: recentFirst(guidance),
    actions: recentFirst(actions)
  });
}

function validateModelWorkerResponse(
  response: ModelWorkerResponse
): ModelWorkerResponse {
  if (!response || typeof response !== "object") {
    throw new Error("Model worker returned an invalid response.");
  }
  if (typeof response.model !== "string" || !response.model.trim()) {
    throw new Error("Model worker response must identify the model.");
  }
  if (
    !response.output ||
    typeof response.output !== "object" ||
    Array.isArray(response.output)
  ) {
    throw new Error("Model worker output must be a structured object.");
  }

  let serializedOutput: string | undefined;
  try {
    serializedOutput = JSON.stringify(response.output);
  } catch {
    throw new Error("Model worker output must be JSON serializable.");
  }
  if (serializedOutput === undefined) {
    throw new Error("Model worker output must be JSON serializable.");
  }

  return {
    model: response.model.trim(),
    output: JSON.parse(serializedOutput) as Record<string, unknown>
  };
}

export async function executeCheckpointModelWorkers(
  snapshot: SubMindStoreSnapshot,
  options: ExecuteCheckpointModelWorkersOptions
): Promise<CheckpointWorkerRun> {
  const now = options.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const plan = createWorkerPlan(options.checkpoint);
  const context = createCheckpointWorkerContext(snapshot, options.scope);
  const priorResults: Partial<Record<ModelWorkerKind, unknown>> = {};
  const executions: ModelWorkerExecution[] = [];

  for (const worker of plan.model) {
    try {
      const response = validateModelWorkerResponse(
        await options.adapter.execute({
          checkpoint: options.checkpoint,
          worker,
          scope: options.scope,
          context,
          priorResults
        })
      );
      const output = redactSensitiveObject(response.output);
      priorResults[worker] = output;
      executions.push({
        worker,
        status: "completed",
        model: redactSensitiveText(response.model).value,
        output
      });
    } catch (error) {
      executions.push({
        worker,
        status: "failed",
        error: redactSensitiveText(String(error)).value
      });
    }
  }

  const completedCount = executions.filter(
    (execution) => execution.status === "completed"
  ).length;
  const status =
    completedCount === executions.length
      ? "completed"
      : completedCount > 0
        ? "partial"
        : "failed";

  return {
    checkpoint: options.checkpoint,
    projectId: context.project.id,
    scope: { ...options.scope, projectId: context.project.id },
    status,
    startedAt,
    completedAt: now(),
    executions
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(
  record: Record<string, unknown>,
  key: string,
  maximumLength = 2_000
): string | null {
  const value = record[key];
  if (typeof value !== "string") {
    return null;
  }
  const normalized = redactSensitiveText(value).value.trim();
  return normalized.length > 0 && normalized.length <= maximumLength
    ? normalized
    : null;
}

function readConfidence(record: Record<string, unknown>): number | null {
  const confidence = record.confidence;
  return typeof confidence === "number" &&
    Number.isFinite(confidence) &&
    confidence >= 0 &&
    confidence <= 1
    ? confidence
    : null;
}

function readKnownIds(
  record: Record<string, unknown>,
  key: string,
  allowedIds: Set<string>
): string[] | null {
  const value = record[key];
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    return null;
  }
  return [...new Set(value)].filter((id) => allowedIds.has(id));
}

function proposalId(kind: "task" | "memory" | "guidance", seed: string): string {
  return `${kind}-model-${fingerprintText(seed)}`;
}

export function createGeneratedCheckpointProposals(
  snapshot: SubMindStoreSnapshot,
  run: CheckpointWorkerRun
): GeneratedCheckpointProposals {
  const events = snapshot.events.filter(
    (event) =>
      event.projectId === run.projectId &&
      (!run.scope.sessionId || event.sessionId === run.scope.sessionId) &&
      (!run.scope.threadId || event.threadId === run.scope.threadId)
  );
  const files = snapshot.fileChanges.filter(
    (file) =>
      file.projectId === run.projectId &&
      (!run.scope.sessionId || file.sessionId === run.scope.sessionId) &&
      (!run.scope.threadId || file.threadId === run.scope.threadId)
  );
  const actions = snapshot.actions.filter(
    (action) =>
      action.projectId === run.projectId &&
      (!run.scope.threadId ||
        action.threadId === undefined ||
        action.threadId === run.scope.threadId)
  );
  const memories = snapshot.memory.filter(
    (memory) =>
      memory.projectId === run.projectId || memory.projectId === undefined
  );
  const eventIds = new Set(events.map((event) => event.id));
  const fileIds = new Set(files.map((file) => file.id));
  const actionIds = new Set(actions.map((action) => action.id));
  const memoryIds = new Set(memories.map((memory) => memory.id));
  const knownThreadIds = new Set(
    snapshot.threads
      .filter(
        (thread) =>
          thread.projectId === run.projectId &&
          (!run.scope.sessionId || thread.sessionId === run.scope.sessionId)
      )
      .map((thread) => thread.id)
  );
  const proposals: GeneratedCheckpointProposals = {
    tasks: [],
    memory: [],
    guidance: [],
    rejected: []
  };

  for (const execution of run.executions) {
    if (execution.status !== "completed" || !execution.output) {
      continue;
    }
    const proposalKind =
      execution.worker === "extraction" &&
      ["thread", "session"].includes(run.checkpoint)
        ? "memory"
        : execution.worker === "task_synthesis" &&
            ["thread", "session"].includes(run.checkpoint)
          ? "task"
        : execution.worker === "composition" && run.checkpoint === "guidance"
          ? "guidance"
          : null;
    if (!proposalKind) {
      continue;
    }
    const proposalKey =
      proposalKind === "memory"
        ? "memories"
        : proposalKind === "task"
          ? "tasks"
          : "guidance";
    const candidates = execution.output[proposalKey];
    if (candidates === undefined && run.status !== "completed") {
      continue;
    }
    if (!Array.isArray(candidates)) {
      proposals.rejected.push({
        kind: proposalKind,
        reason: `Worker output is missing the ${proposalKey} array.`
      });
      continue;
    }

    for (const candidate of candidates) {
      if (!isRecord(candidate)) {
        proposals.rejected.push({
          kind: proposalKind,
          reason: "Proposal must be a structured object."
        });
        continue;
      }
      if (proposalKind === "task") {
        const title = readText(candidate, "title", 300);
        const summary = readText(candidate, "summary");
        const priority = candidate.priority;
        const threadId =
          run.scope.threadId ??
          (typeof candidate.threadId === "string" ? candidate.threadId : "");
        const sourceEventIds = readKnownIds(
          candidate,
          "sourceEventIds",
          eventIds
        );
        if (
          !title ||
          !summary ||
          !["low", "medium", "high"].includes(String(priority)) ||
          !["queued", "active", "blocked", "completed"].includes(
            String(candidate.status)
          ) ||
          !threadId ||
          !knownThreadIds.has(threadId) ||
          !sourceEventIds ||
          sourceEventIds.length === 0 ||
          sourceEventIds.some(
            (eventId) =>
              !events.some(
                (event) =>
                  event.id === eventId &&
                  event.threadId === threadId &&
                  (!run.scope.sessionId ||
                    event.sessionId === run.scope.sessionId)
              )
          )
        ) {
          proposals.rejected.push({
            kind: "task",
            reason:
              "Task proposal needs valid text, priority, thread scope, and event evidence from that thread."
          });
          continue;
        }
        const id = proposalId(
          "task",
          `${run.projectId}:${threadId}:${title}:${summary}`
        );
        if (
          snapshot.tasks.some((task) => task.id === id) ||
          proposals.tasks.some((task) => task.id === id)
        ) {
          continue;
        }
        const thread = snapshot.threads.find((item) => item.id === threadId);
        if (!thread) {
          continue;
        }
        proposals.tasks.push({
          kind: "Task",
          id,
          projectId: run.projectId,
          sessionId: thread.sessionId,
          threadId,
          title,
          summary,
          status: "proposed",
          suggestedStatus: candidate.status as NonNullable<Task["suggestedStatus"]>,
          priority: priority as Task["priority"],
          source: "model",
          contextEligible: false,
          sourceEventIds,
          createdAt: run.completedAt,
          updatedAt: run.completedAt
        });
        continue;
      }
      const title = readText(
        candidate,
        proposalKind === "memory" ? "summary" : "title",
        300
      );
      const content =
        proposalKind === "memory"
          ? readText(candidate, "content")
          : readText(candidate, "summary");
      const confidence = readConfidence(candidate);
      const linkedEventIds = readKnownIds(candidate, "sourceEventIds", eventIds) ??
        readKnownIds(candidate, "linkedEventIds", eventIds);

      if (
        !title ||
        !content ||
        confidence === null ||
        !linkedEventIds ||
        linkedEventIds.length === 0
      ) {
        proposals.rejected.push({
          kind: proposalKind,
          reason: "Proposal is missing valid text, confidence, or scoped event evidence."
        });
        continue;
      }

      if (proposalKind === "memory") {
        const bucket = candidate.bucket;
        const validBuckets: MemoryItem["bucket"][] = [
          "project_context",
          "architecture_notes",
          "preferences",
          "pending_items",
          "gotchas",
          "workflow_patterns"
        ];
        const sourceFileChangeIds =
          readKnownIds(candidate, "sourceFileChangeIds", fileIds);
        if (
          typeof bucket !== "string" ||
          !validBuckets.includes(bucket as MemoryItem["bucket"]) ||
          !sourceFileChangeIds
        ) {
          proposals.rejected.push({
            kind: "memory",
            reason: "Memory proposal has an invalid bucket or file evidence."
          });
          continue;
        }
        const id = proposalId(
          "memory",
          `${run.projectId}:${run.scope.threadId ?? run.scope.sessionId ?? "project"}:${title}:${content}`
        );
        if (memoryIds.has(id) || proposals.memory.some((item) => item.id === id)) {
          continue;
        }
        proposals.memory.push({
          kind: "MemoryItem",
          id,
          projectId: run.projectId,
          ...(run.scope.sessionId ? { sessionId: run.scope.sessionId } : {}),
          ...(run.scope.threadId ? { threadId: run.scope.threadId } : {}),
          bucket: bucket as MemoryItem["bucket"],
          status: "draft",
          summary: title,
          content,
          confidence,
          freshness: 1,
          curationState: "derived",
          sourceEventIds: linkedEventIds,
          sourceFileChangeIds,
          linkedActionItemIds: [],
          linkedGuidanceItemIds: [],
          contextEligible: false,
          changeSummary: "Generated for operator review.",
          isPinned: false,
          isEdited: false,
          createdAt: run.completedAt,
          updatedAt: run.completedAt
        });
        continue;
      }

      const rationale = readText(candidate, "rationale");
      const evidenceSummary = readText(candidate, "evidenceSummary");
      const policySummary = readText(candidate, "policySummary");
      const linkedMemoryItemIds =
        readKnownIds(candidate, "linkedMemoryItemIds", memoryIds);
      const linkedActionItemIds =
        readKnownIds(candidate, "linkedActionItemIds", actionIds);
      if (
        !rationale ||
        !evidenceSummary ||
        !policySummary ||
        !linkedMemoryItemIds ||
        !linkedActionItemIds
      ) {
        proposals.rejected.push({
          kind: "guidance",
          reason: "Guidance proposal is missing rationale, summaries, or valid entity links."
        });
        continue;
      }
      const id = proposalId(
        "guidance",
        `${run.projectId}:${run.scope.threadId ?? run.scope.sessionId ?? "project"}:${title}:${content}:${rationale}`
      );
      if (
        snapshot.guidance.some((item) => item.id === id) ||
        proposals.guidance.some((item) => item.id === id)
      ) {
        continue;
      }
      proposals.guidance.push({
        kind: "GuidanceItem",
        id,
        projectId: run.projectId,
        ...(run.scope.sessionId ? { sessionId: run.scope.sessionId } : {}),
        ...(run.scope.threadId ? { threadId: run.scope.threadId } : {}),
        title,
        summary: content,
        rationale,
        state: "candidate",
        source: "model",
        confidence,
        evidenceSummary,
        policySummary,
        linkedMemoryItemIds,
        linkedEventIds,
        linkedActionItemIds,
        contextEligible: false,
        createdAt: run.completedAt,
        updatedAt: run.completedAt
      });
    }
  }

  return redactSensitiveObject(proposals);
}

export function createCheckpointRunAuditEvent(
  run: CheckpointWorkerRun,
  proposals?: GeneratedCheckpointProposals
): Event {
  const timestamp = run.completedAt;
  const fingerprint = fingerprintText(
    `${run.projectId}:${run.checkpoint}:${run.startedAt}:${run.completedAt}:${JSON.stringify(run.executions)}`
  );
  const completedCount = run.executions.filter(
    (execution) => execution.status === "completed"
  ).length;

  return redactSensitiveObject({
    kind: "Event",
    id: `event-model-checkpoint-${fingerprint}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    projectId: run.projectId,
    ...(run.scope.sessionId ? { sessionId: run.scope.sessionId } : {}),
    ...(run.scope.threadId ? { threadId: run.scope.threadId } : {}),
    originType: "submind",
    eventType: "model-checkpoint-run",
    category: "system_user",
    nodeCategory: "marker",
    timestamp,
    summary: `Model ${run.checkpoint} checkpoint ${run.status}: ${completedCount}/${run.executions.length} workers completed.`,
    metadata: {
      checkpoint: run.checkpoint,
      scope: run.scope,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      executions: run.executions,
      ...(proposals
        ? {
            generatedMemoryIds: proposals.memory.map((item) => item.id),
            generatedTaskIds: proposals.tasks.map((item) => item.id),
            generatedGuidanceIds: proposals.guidance.map((item) => item.id),
            rejectedProposalCount: proposals.rejected.length,
            rejectedProposals: proposals.rejected
          }
        : {})
    }
  });
}
