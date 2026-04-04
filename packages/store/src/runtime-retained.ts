import type {
  ActionItem,
  Event,
  FileChange,
  GuidanceItem,
  MemoryItem,
  Project,
  Session,
  Task,
  Thread
} from "@submind/shared-schemas";
import type { SubMindStoreSnapshot } from "./index.js";

export interface DerivedRetainedState {
  memory: MemoryItem[];
  guidance: GuidanceItem[];
}

function compareDescending(left: string, right: string): number {
  return right.localeCompare(left);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function summarize(value: string | undefined, fallback: string, maxLength = 220): string {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";

  if (!normalized) {
    return fallback;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function formatTitleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getFreshness(timestamp: string, nowTimestamp: string): number {
  const now = Date.parse(nowTimestamp);
  const then = Date.parse(timestamp);

  if (Number.isNaN(now) || Number.isNaN(then)) {
    return 0.5;
  }

  const ageHours = Math.max(0, now - then) / (1000 * 60 * 60);

  if (ageHours <= 6) {
    return 0.98;
  }

  if (ageHours <= 24) {
    return clamp(0.92 - (ageHours - 6) * 0.015, 0.7, 0.92);
  }

  if (ageHours <= 72) {
    return clamp(0.7 - (ageHours - 24) * 0.0075, 0.35, 0.7);
  }

  return clamp(0.35 - (ageHours - 72) * 0.002, 0.08, 0.35);
}

function buildMemoryId(prefix: string, id: string): string {
  return `memory-runtime-${prefix}-${id}`;
}

function buildGuidanceId(threadId: string): string {
  return `guidance-runtime-thread-${threadId}`;
}

function getProjectSessions(snapshot: SubMindStoreSnapshot, projectId: string): Session[] {
  return snapshot.sessions
    .filter((session) => session.projectId === projectId)
    .sort((left, right) => compareDescending(left.updatedAt, right.updatedAt));
}

function getSessionThreads(snapshot: SubMindStoreSnapshot, sessionId: string): Thread[] {
  return snapshot.threads
    .filter((thread) => thread.sessionId === sessionId)
    .sort((left, right) => compareDescending(left.updatedAt, right.updatedAt));
}

function getThreadEvents(snapshot: SubMindStoreSnapshot, threadId: string): Event[] {
  return snapshot.events
    .filter((event) => event.threadId === threadId)
    .sort((left, right) => compareDescending(left.timestamp, right.timestamp));
}

function getThreadFileChanges(
  snapshot: SubMindStoreSnapshot,
  threadId: string
): FileChange[] {
  return snapshot.fileChanges
    .filter((fileChange) => fileChange.threadId === threadId)
    .sort((left, right) => compareDescending(left.updatedAt, right.updatedAt));
}

function getThreadTasks(snapshot: SubMindStoreSnapshot, threadId: string): Task[] {
  return snapshot.tasks
    .filter((task) => task.threadId === threadId)
    .sort((left, right) => compareDescending(left.updatedAt, right.updatedAt));
}

function getThreadActions(
  snapshot: SubMindStoreSnapshot,
  thread: Thread
): ActionItem[] {
  return snapshot.actions
    .filter((actionItem) => {
      if (actionItem.projectId !== thread.projectId) {
        return false;
      }

      if (actionItem.threadId) {
        return actionItem.threadId === thread.id;
      }

      return actionItem.sessionId === thread.sessionId;
    })
    .sort((left, right) => compareDescending(left.updatedAt, right.updatedAt));
}

function determineThreadMemoryBucket(
  primaryTask: Task | undefined,
  fileChanges: FileChange[]
): MemoryItem["bucket"] {
  if (primaryTask?.status === "blocked") {
    return "gotchas";
  }

  if (primaryTask && primaryTask.status !== "completed") {
    return "pending_items";
  }

  if (
    fileChanges.some((fileChange) =>
      ["config", "doc"].includes(fileChange.fileType)
    )
  ) {
    return "architecture_notes";
  }

  return "workflow_patterns";
}

function buildProjectContextMemory(
  snapshot: SubMindStoreSnapshot,
  project: Project,
  nowTimestamp: string,
  existing: MemoryItem | undefined
): MemoryItem {
  const id = buildMemoryId("project-context", project.id);
  const sessions = getProjectSessions(snapshot, project.id);
  const threads = sessions.flatMap((session) => getSessionThreads(snapshot, session.id));
  const projectEvents = snapshot.events
    .filter((event) => event.projectId === project.id)
    .sort((left, right) => compareDescending(left.timestamp, right.timestamp));
  const projectFileChanges = snapshot.fileChanges
    .filter((fileChange) => fileChange.projectId === project.id)
    .sort((left, right) => compareDescending(left.updatedAt, right.updatedAt));
  const linkedActions = snapshot.actions
    .filter((actionItem) => actionItem.projectId === project.id)
    .sort((left, right) => compareDescending(left.updatedAt, right.updatedAt));
  const newestSignal = projectEvents[0]?.timestamp ??
    projectFileChanges[0]?.updatedAt ??
    project.updatedAt;
  const freshness = getFreshness(newestSignal, nowTimestamp);
  const confidence = clamp(
    0.72 +
      Math.min(project.descriptors.length, 4) * 0.04 +
      Math.min(projectEvents.length, 4) * 0.02,
    0.72,
    0.94
  );
  const recentThreadSummary =
    threads.length > 0
      ? `Recent threads: ${threads.slice(0, 2).map((thread) => thread.title).join(" / ")}.`
      : "No recent threads captured yet.";
  const recentChangeSummary =
    projectFileChanges[0]?.summary ??
    projectEvents[0]?.summary ??
    "Project context is currently driven by workspace metadata.";
  const derived: MemoryItem = {
    kind: "MemoryItem",
    id,
    projectId: project.id,
    bucket: "project_context",
    status: freshness < 0.35 ? "stale" : "active",
    summary: `${project.name} context`,
    content: summarize(
      `${project.summary ?? project.description ?? `${project.name} project.`} ${recentThreadSummary} ${recentChangeSummary} ${
        project.descriptors.length > 0
          ? `Descriptors: ${project.descriptors.join(", ")}.`
          : ""
      }`,
      `${project.name} project context.`,
      420
    ),
    confidence,
    freshness,
    curationState: existing?.isEdited
      ? "edited"
      : existing?.curationState === "confirmed"
        ? "confirmed"
        : "derived",
    sourceEventIds: uniqueStrings(projectEvents.slice(0, 4).map((event) => event.id)),
    sourceFileChangeIds: uniqueStrings(
      projectFileChanges.slice(0, 4).map((fileChange) => fileChange.id)
    ),
    linkedActionItemIds: uniqueStrings(
      linkedActions.slice(0, 4).map((actionItem) => actionItem.id)
    ),
    linkedGuidanceItemIds: existing?.linkedGuidanceItemIds ?? [],
    changeSummary: summarize(recentChangeSummary, "Project context refreshed."),
    isPinned: existing?.isPinned ?? project.id === snapshot.profiles[0]?.defaultProjectId,
    isEdited: existing?.isEdited ?? false,
    createdAt: existing?.createdAt ?? project.createdAt,
    updatedAt: nowTimestamp
  };

  if (existing?.isEdited) {
    return {
      ...derived,
      summary: existing.summary,
      content: existing.content,
      status: existing.status,
      isPinned: existing.isPinned,
      isEdited: true
    };
  }

  return derived;
}

function buildThreadMemory(
  snapshot: SubMindStoreSnapshot,
  thread: Thread,
  session: Session,
  project: Project | undefined,
  nowTimestamp: string,
  existing: MemoryItem | undefined
): MemoryItem {
  const id = buildMemoryId("thread", thread.id);
  const events = getThreadEvents(snapshot, thread.id);
  const fileChanges = getThreadFileChanges(snapshot, thread.id);
  const tasks = getThreadTasks(snapshot, thread.id);
  const actions = getThreadActions(snapshot, thread);
  const primaryTask = tasks[0];
  const newestSignal = events[0]?.timestamp ?? fileChanges[0]?.updatedAt ?? thread.updatedAt;
  const freshness = getFreshness(newestSignal, nowTimestamp);
  const confidence = clamp(
    0.58 +
      Math.min(events.length, 5) * 0.04 +
      Math.min(fileChanges.length, 4) * 0.05 +
      (primaryTask ? 0.05 : 0),
    0.58,
    0.93
  );
  const content = summarize(
    `${thread.summary ?? thread.title}. Session: ${
      session.summary ?? "No session summary."
    } Latest trace: ${
      events[0]?.summary ?? "No event summary."
    } Files: ${
      fileChanges.length > 0
        ? fileChanges.slice(0, 3).map((fileChange) => fileChange.path).join(", ")
        : "no file changes captured"
    }. ${primaryTask ? `Primary task: ${primaryTask.title}.` : ""}`,
    thread.summary ?? thread.title,
    420
  );
  const derived: MemoryItem = {
    kind: "MemoryItem",
    id,
    projectId: thread.projectId,
    sessionId: session.id,
    threadId: thread.id,
    bucket: determineThreadMemoryBucket(primaryTask, fileChanges),
    status:
      thread.status === "closed"
        ? freshness < 0.4
          ? "archived"
          : "stale"
        : freshness < 0.35
          ? "stale"
          : "active",
    summary: thread.title,
    content,
    confidence,
    freshness,
    curationState: existing?.isEdited
      ? "edited"
      : existing?.curationState === "confirmed"
        ? "confirmed"
        : "derived",
    sourceEventIds: uniqueStrings(events.slice(0, 5).map((event) => event.id)),
    sourceFileChangeIds: uniqueStrings(fileChanges.slice(0, 5).map((fileChange) => fileChange.id)),
    linkedActionItemIds: uniqueStrings(actions.slice(0, 4).map((actionItem) => actionItem.id)),
    linkedGuidanceItemIds: existing?.linkedGuidanceItemIds ?? [],
    changeSummary: summarize(
      fileChanges[0]?.summary ??
        events[0]?.summary ??
        `${thread.title} remained the dominant work trace.`,
      `${thread.title} refreshed.`,
      200
    ),
    isPinned: existing?.isPinned ?? thread.id === snapshot.threads[0]?.id,
    isEdited: existing?.isEdited ?? false,
    createdAt: existing?.createdAt ?? thread.createdAt,
    updatedAt: nowTimestamp
  };

  if (existing?.isEdited) {
    return {
      ...derived,
      summary: existing.summary,
      content: existing.content,
      status: existing.status,
      isPinned: existing.isPinned,
      isEdited: true
    };
  }

  if (project?.id === snapshot.profiles[0]?.defaultProjectId) {
    return {
      ...derived,
      isPinned: existing?.isPinned ?? true
    };
  }

  return derived;
}

function buildTaskMemory(
  snapshot: SubMindStoreSnapshot,
  task: Task,
  thread: Thread | undefined,
  nowTimestamp: string,
  existing: MemoryItem | undefined
): MemoryItem {
  const id = buildMemoryId("task", task.id);
  const threadEvents = thread ? getThreadEvents(snapshot, thread.id) : [];
  const threadFileChanges = thread ? getThreadFileChanges(snapshot, thread.id) : [];
  const freshness = getFreshness(task.updatedAt, nowTimestamp);
  const derived: MemoryItem = {
    kind: "MemoryItem",
    id,
    projectId: task.projectId,
    sessionId: task.sessionId,
    threadId: task.threadId,
    bucket: task.status === "blocked" ? "gotchas" : "pending_items",
    status: task.status === "completed" ? "superseded" : "active",
    summary: task.title,
    content: summarize(
      `${task.summary ?? task.title}. Status: ${formatTitleCase(task.status)}. Priority: ${formatTitleCase(
        task.priority
      )}. Latest supporting trace: ${threadEvents[0]?.summary ?? "No event summary."}`,
      task.title,
      320
    ),
    confidence: task.status === "blocked" ? 0.86 : 0.74,
    freshness,
    curationState: existing?.isEdited
      ? "edited"
      : existing?.curationState === "confirmed"
        ? "confirmed"
        : "derived",
    sourceEventIds: uniqueStrings(threadEvents.slice(0, 3).map((event) => event.id)),
    sourceFileChangeIds: uniqueStrings(
      threadFileChanges.slice(0, 3).map((fileChange) => fileChange.id)
    ),
    linkedActionItemIds: uniqueStrings(
      snapshot.actions
        .filter((actionItem) => actionItem.threadId === task.threadId)
        .slice(0, 4)
        .map((actionItem) => actionItem.id)
    ),
    linkedGuidanceItemIds: existing?.linkedGuidanceItemIds ?? [],
    changeSummary:
      task.status === "blocked"
        ? "This task is currently blocked and should remain operator-visible."
        : "This task remains active in the current work trace.",
    isPinned: existing?.isPinned ?? task.status === "blocked",
    isEdited: existing?.isEdited ?? false,
    createdAt: existing?.createdAt ?? task.createdAt,
    updatedAt: nowTimestamp
  };

  if (existing?.isEdited) {
    return {
      ...derived,
      summary: existing.summary,
      content: existing.content,
      status: existing.status,
      isPinned: existing.isPinned,
      isEdited: true
    };
  }

  return derived;
}

function buildThreadGuidance(
  snapshot: SubMindStoreSnapshot,
  thread: Thread,
  session: Session,
  project: Project | undefined,
  nowTimestamp: string,
  existing: GuidanceItem | undefined
): GuidanceItem {
  const id = buildGuidanceId(thread.id);
  const events = getThreadEvents(snapshot, thread.id);
  const fileChanges = getThreadFileChanges(snapshot, thread.id);
  const tasks = getThreadTasks(snapshot, thread.id);
  const actions = getThreadActions(snapshot, thread);
  const highRiskActions = actions.filter((actionItem) =>
    ["high", "critical"].includes(actionItem.riskLevel)
  );
  const primaryTask = tasks[0];
  const linkedMemory = snapshot.memory
    .filter((memoryItem) =>
      memoryItem.threadId === thread.id ||
      memoryItem.sessionId === session.id ||
      memoryItem.projectId === thread.projectId
    )
    .sort((left, right) => compareDescending(left.updatedAt, right.updatedAt))
    .slice(0, 4);
  const latestEvent = events[0];
  const confidence = clamp(
    0.52 +
      Math.min(events.length, 4) * 0.05 +
      Math.min(fileChanges.length, 3) * 0.05 +
      Math.min(linkedMemory.length, 3) * 0.04 +
      (highRiskActions.length > 0 ? 0.12 : 0),
    0.52,
    0.94
  );
  let state: GuidanceItem["state"];
  let source: GuidanceItem["source"];
  let title: string;
  let summary: string;
  let rationale: string;
  let policySummary: string;

  if (highRiskActions.length > 0) {
    const leadAction = highRiskActions[0]!;
    state = "injected";
    source = "policy";
    title = leadAction.title;
    summary =
      leadAction.summary ??
      leadAction.riskSummary;
    rationale =
      `High-risk action pressure is already present in this thread, so guidance is promoted into the injected state to keep operator attention attached to the real control loop.`;
    policySummary =
      "High-risk or critical action pressure escalates thread guidance into injected posture.";
  } else if (primaryTask?.status === "blocked") {
    state = "suggested";
    source = "system";
    title = `Resolve blocker in ${thread.title}`;
    summary =
      primaryTask.summary ??
      `The current thread is carrying a blocked task that needs a concrete next move.`;
    rationale =
      `The trace shows a blocked task with fresh supporting events, so the system is surfacing a suggested intervention rather than suppressing the thread.`;
    policySummary =
      "Blocked task state produces a suggested intervention until action pressure or resolution clarifies the next step.";
  } else if (thread.status === "closed" && events.length === 0 && fileChanges.length === 0) {
    state = "suppressed";
    source = "system";
    title = `Suppress dormant guidance for ${thread.title}`;
    summary = "The thread is closed and no fresh work evidence remains in the current runtime slice.";
    rationale =
      "Without fresh events or file changes, this thread does not deserve active guidance attention.";
    policySummary =
      "Closed threads with no current evidence are suppressed to keep the queue truthful.";
  } else if (thread.status === "closed") {
    state = "resolved";
    source = "system";
    title = `Close the loop on ${thread.title}`;
    summary =
      latestEvent?.summary ??
      "The trace is closed and guidance should move into historical posture.";
    rationale =
      "The thread is no longer active, so guidance is preserved as resolved context instead of remaining live intervention.";
    policySummary =
      "Closed work traces become resolved guidance when evidence is still worth retaining.";
  } else if (fileChanges.length > 0 || events.length > 1) {
    state = "suggested";
    source = "system";
    title = `Review recent work in ${project?.name ?? "this project"}`;
    summary =
      fileChanges[0]?.summary ??
      latestEvent?.summary ??
      `Recent activity suggests the thread is ready for a truth-preserving review pass.`;
    rationale =
      "Recent file changes and ordered events indicate this thread has enough concrete work to deserve an explicit suggested next step.";
    policySummary =
      "Recent concrete work with enough trace evidence becomes suggested guidance.";
  } else {
    state = "candidate";
    source = "system";
    title = `Keep ${thread.title} in view`;
    summary =
      latestEvent?.summary ??
      `The thread is active, but evidence is still light and should remain candidate-level.`;
    rationale =
      "The thread is still active, but the system does not yet have enough concrete evidence to inject or strongly suggest intervention.";
    policySummary =
      "Low-evidence active work remains in candidate posture.";
  }

  const evidenceSummary = `${events.length} events / ${fileChanges.length} file changes / ${
    linkedMemory.length
  } memory links${latestEvent ? ` / latest: ${summarize(latestEvent.summary, latestEvent.summary, 100)}` : ""}`;

  return {
    kind: "GuidanceItem",
    id,
    projectId: thread.projectId,
    sessionId: session.id,
    threadId: thread.id,
    title,
    summary,
    rationale,
    state,
    source,
    confidence,
    evidenceSummary,
    policySummary,
    linkedMemoryItemIds: uniqueStrings(linkedMemory.map((memoryItem) => memoryItem.id)),
    linkedEventIds: uniqueStrings(events.slice(0, 5).map((event) => event.id)),
    linkedActionItemIds: uniqueStrings(actions.slice(0, 4).map((actionItem) => actionItem.id)),
    createdAt: existing?.createdAt ?? thread.createdAt,
    updatedAt: nowTimestamp
  };
}

function linkMemoryToGuidance(
  memoryItems: MemoryItem[],
  guidanceItems: GuidanceItem[]
): MemoryItem[] {
  return memoryItems.map((memoryItem) => ({
    ...memoryItem,
    linkedGuidanceItemIds: uniqueStrings(
      guidanceItems
        .filter((guidanceItem) =>
          guidanceItem.linkedMemoryItemIds.includes(memoryItem.id)
        )
        .map((guidanceItem) => guidanceItem.id)
    )
  }));
}

export function deriveRetainedState(
  snapshot: SubMindStoreSnapshot,
  nowTimestamp: string = new Date().toISOString()
): DerivedRetainedState {
  const existingMemoryById = new Map(snapshot.memory.map((item) => [item.id, item]));
  const existingGuidanceById = new Map(
    snapshot.guidance.map((item) => [item.id, item])
  );

  const projectMemory = snapshot.projects.map((project) =>
    buildProjectContextMemory(
      snapshot,
      project,
      nowTimestamp,
      existingMemoryById.get(buildMemoryId("project-context", project.id))
    )
  );
  const threadMemory = snapshot.threads.map((thread) => {
    const session = snapshot.sessions.find((item) => item.id === thread.sessionId);
    const project = snapshot.projects.find((item) => item.id === thread.projectId);

    if (!session) {
      return null;
    }

    return buildThreadMemory(
      snapshot,
      thread,
      session,
      project,
      nowTimestamp,
      existingMemoryById.get(buildMemoryId("thread", thread.id))
    );
  });
  const taskMemory = snapshot.tasks
    .filter((task) => task.status === "blocked" || task.status === "active")
    .map((task) =>
      buildTaskMemory(
        snapshot,
        task,
        snapshot.threads.find((thread) => thread.id === task.threadId),
        nowTimestamp,
        existingMemoryById.get(buildMemoryId("task", task.id))
      )
    );

  const memory = [...projectMemory, ...threadMemory, ...taskMemory]
    .filter((item): item is MemoryItem => item !== null)
    .sort((left, right) => compareDescending(left.updatedAt, right.updatedAt));
  const guidance = snapshot.threads
    .map((thread) => {
      const session = snapshot.sessions.find((item) => item.id === thread.sessionId);
      const project = snapshot.projects.find((item) => item.id === thread.projectId);

      if (!session) {
        return null;
      }

      return buildThreadGuidance(
        {
          ...snapshot,
          memory
        },
        thread,
        session,
        project,
        nowTimestamp,
        existingGuidanceById.get(buildGuidanceId(thread.id))
      );
    })
    .filter((item): item is GuidanceItem => item !== null)
    .sort((left, right) => compareDescending(left.updatedAt, right.updatedAt));

  return {
    memory: linkMemoryToGuidance(memory, guidance),
    guidance
  };
}
