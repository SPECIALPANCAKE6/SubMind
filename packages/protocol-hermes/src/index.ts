import {
  createProjectGroupingKey,
  createProjectIdFromWorkspacePath,
  getWorkspaceBaseName,
  normalizeWorkspacePath,
  type Event,
  type FileChange,
  type ISODateString,
  type Profile,
  type Project,
  type Session,
  type Task,
  type Thread
} from "@submind/shared-schemas";
import type { SubMindStoreSnapshot } from "@submind/store";

export interface HermesProtocolEnvelope {
  source: "hermes";
  receivedAt: ISODateString;
  sessionId: string;
  threadId: string;
  events: Event[];
  fileChanges: FileChange[];
}

export function createEmptyHermesProtocolEnvelope(
  sessionId: string,
  threadId: string,
  receivedAt: ISODateString
): HermesProtocolEnvelope {
  return {
    source: "hermes",
    receivedAt,
    sessionId,
    threadId,
    events: [],
    fileChanges: []
  };
}

export interface HermesRuntimeFileChangeRecord {
  path: string;
  changeType?: FileChange["changeType"];
  fromPath?: string;
  summary?: string;
  diffPreview?: string;
}

export interface HermesRuntimeTurnRecord {
  id: string;
  timestamp: number;
  prompt: string;
  response: string | null;
  modelId: string | null;
  toolNames: string[];
  referencedFiles: string[];
  fileChanges: HermesRuntimeFileChangeRecord[];
}

export interface HermesRuntimeThreadRecord {
  id: string;
  title: string;
  workspacePath: string | null;
  createdAt: number;
  updatedAt: number;
  latestUserMessage: string | null;
  modelName: string | null;
  modelId: string | null;
  descriptorHints: string[];
  turns: HermesRuntimeTurnRecord[];
}

export interface HermesRuntimeFeed {
  profileName: string;
  threads: HermesRuntimeThreadRecord[];
}

interface RuntimeProjectBucket {
  id: string;
  key: string;
  workspacePath: string | null;
  threads: HermesRuntimeThreadRecord[];
}

const profileId = "profile-local-operator";
const hermesGlobalProjectId = "project-hermes-global";
const hermesGlobalProjectKey = "hermes-global";
const millisecondsPerHour = 60 * 60 * 1000;

function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function summarizeText(value: string | null | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const normalized = value
    .replace(/[#>*`\[\]]/g, " ")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return fallback;
  }

  return truncateText(normalized, 180);
}

function toEpochMs(value: number): number {
  return value < 10_000_000_000 ? value * 1000 : value;
}

function toIsoDate(value: number): ISODateString {
  return new Date(toEpochMs(value)).toISOString();
}

function getIdleHours(updatedAt: number, now: number): number {
  return Math.max(0, now - toEpochMs(updatedAt)) / millisecondsPerHour;
}

function normalizeProjectWorkspacePath(
  thread: HermesRuntimeThreadRecord
): string | null {
  if (!thread.workspacePath) {
    return null;
  }

  const normalized = normalizeWorkspacePath(thread.workspacePath);
  return normalized || null;
}

function getProjectKey(thread: HermesRuntimeThreadRecord): string {
  const workspacePath = normalizeProjectWorkspacePath(thread);

  if (!workspacePath) {
    return hermesGlobalProjectKey;
  }

  return createProjectGroupingKey(workspacePath);
}

function getProjectId(thread: HermesRuntimeThreadRecord): string {
  const workspacePath = normalizeProjectWorkspacePath(thread);

  if (!workspacePath) {
    return hermesGlobalProjectId;
  }

  return createProjectIdFromWorkspacePath(workspacePath);
}

function createSessionId(threadId: string): string {
  return `session-hermes-${threadId}`;
}

function createThreadId(threadId: string): string {
  return `thread-hermes-${threadId}`;
}

function createTaskId(threadId: string, turnId: string): string {
  return `task-hermes-${threadId}-${turnId}`;
}

function createOpenedEventId(threadId: string): string {
  return `event-hermes-${threadId}-opened`;
}

function createUserEventId(threadId: string, turnId: string): string {
  return `event-hermes-${threadId}-${turnId}-user`;
}

function createResponseEventId(threadId: string, turnId: string): string {
  return `event-hermes-${threadId}-${turnId}-response`;
}

function createChangeEventId(threadId: string, turnId: string): string {
  return `event-hermes-${threadId}-${turnId}-change`;
}

function createFileChangeId(
  threadId: string,
  turnId: string,
  index: number
): string {
  return `file-change-hermes-${threadId}-${turnId}-${index}`;
}

function compareThreadRecency(
  left: HermesRuntimeThreadRecord,
  right: HermesRuntimeThreadRecord
): number {
  return (
    toEpochMs(right.updatedAt) - toEpochMs(left.updatedAt) ||
    toEpochMs(right.createdAt) - toEpochMs(left.createdAt)
  );
}

function compareTurnRecency(
  left: HermesRuntimeTurnRecord,
  right: HermesRuntimeTurnRecord
): number {
  return toEpochMs(right.timestamp) - toEpochMs(left.timestamp);
}

function resolveSessionStatus(
  thread: HermesRuntimeThreadRecord,
  now: number
): Session["status"] {
  const idleHours = getIdleHours(thread.updatedAt, now);

  if (idleHours <= 6) {
    return "active";
  }

  if (idleHours <= 72) {
    return "idle";
  }

  return "completed";
}

function resolveThreadStatus(
  thread: HermesRuntimeThreadRecord,
  now: number
): Thread["status"] {
  const idleHours = getIdleHours(thread.updatedAt, now);

  if (idleHours <= 6) {
    return "open";
  }

  if (idleHours <= 72) {
    return "idle";
  }

  return "closed";
}

function resolveTaskStatus(
  sessionStatus: Session["status"],
  isLatestTurn: boolean,
  hasResponse: boolean
): Task["status"] {
  if (!hasResponse) {
    return "active";
  }

  if (isLatestTurn && sessionStatus === "active") {
    return "active";
  }

  if (isLatestTurn && sessionStatus === "idle") {
    return "queued";
  }

  return "completed";
}

function resolveTaskPriority(
  turn: HermesRuntimeTurnRecord,
  now: number
): Task["priority"] {
  const idleHours = getIdleHours(turn.timestamp, now);

  if (idleHours <= 24) {
    return "high";
  }

  if (idleHours <= 24 * 7) {
    return "medium";
  }

  return "low";
}

function inferFileType(path: string): FileChange["fileType"] {
  const normalized = path.toLowerCase();

  if (/\.(ts|tsx|js|jsx|rs|py|go|java|kt|swift|css|scss|html|json|toml|yaml|yml|md)$/.test(normalized)) {
    if (normalized.endsWith(".md")) {
      return "doc";
    }

    if (/\.(json|toml|yaml|yml)$/.test(normalized)) {
      return "config";
    }

    return "source";
  }

  if (/\.(png|jpg|jpeg|gif|svg|ico|webp|avif)$/.test(normalized)) {
    return "asset";
  }

  return "other";
}

function inferLanguage(path: string): string | undefined {
  const extension = path.toLowerCase().split(".").pop();

  switch (extension) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "rs":
      return "rust";
    case "py":
      return "python";
    case "go":
      return "go";
    case "json":
      return "json";
    case "toml":
      return "toml";
    case "yml":
    case "yaml":
      return "yaml";
    case "md":
      return "markdown";
    case "css":
    case "scss":
      return "css";
    case "html":
      return "html";
    default:
      return undefined;
  }
}

function groupThreadsByProject(
  threads: HermesRuntimeThreadRecord[]
): RuntimeProjectBucket[] {
  const buckets = new Map<string, RuntimeProjectBucket>();

  for (const thread of threads) {
    const key = getProjectKey(thread);
    const workspacePath = normalizeProjectWorkspacePath(thread);
    const normalizedThread = {
      ...thread,
      workspacePath
    };
    const existingBucket = buckets.get(key);

    if (existingBucket) {
      existingBucket.threads.push(normalizedThread);
      continue;
    }

    buckets.set(key, {
      id: getProjectId(thread),
      key,
      workspacePath,
      threads: [normalizedThread]
    });
  }

  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      threads: [...bucket.threads].sort(compareThreadRecency)
    }))
    .sort((left, right) => compareThreadRecency(left.threads[0]!, right.threads[0]!));
}

function buildProjectEntities(buckets: RuntimeProjectBucket[]): Project[] {
  return buckets.map((bucket) => {
    const newestThread = bucket.threads[0]!;
    const oldestThread =
      bucket.threads[bucket.threads.length - 1] ?? newestThread;
    const descriptors = [
      ...new Set([
        "hermes",
        "agent",
        ...bucket.threads.flatMap((thread) => thread.descriptorHints)
      ])
    ].slice(0, 6);
    const project: Project = {
      kind: "Project",
      id: bucket.id,
      profileId,
      name: bucket.workspacePath
        ? getWorkspaceBaseName(bucket.workspacePath)
        : "Hermes Global Activity",
      description: bucket.workspacePath
        ? "Hermes activity captured from local agent threads for this workspace."
        : "Hermes activity captured without a resolved workspace.",
      summary: summarizeText(
        newestThread.latestUserMessage,
        newestThread.title || "Hermes agent activity."
      ),
      descriptors,
      createdAt: toIsoDate(oldestThread.createdAt),
      updatedAt: toIsoDate(newestThread.updatedAt)
    };

    if (bucket.workspacePath) {
      project.workspacePath = bucket.workspacePath;
    }

    return project;
  });
}

function buildSessionEntities(
  threads: HermesRuntimeThreadRecord[],
  projectIdByThreadId: Map<string, string>,
  now: number
): Session[] {
  return [...threads]
    .sort(compareThreadRecency)
    .map((thread) => ({
      kind: "Session",
      id: createSessionId(thread.id),
      profileId,
      projectId: projectIdByThreadId.get(thread.id) ?? hermesGlobalProjectId,
      status: resolveSessionStatus(thread, now),
      summary: summarizeText(
        thread.latestUserMessage,
        thread.title || "Hermes agent session"
      ),
      startedAt: toIsoDate(thread.createdAt),
      ...(resolveSessionStatus(thread, now) === "completed"
        ? { completedAt: toIsoDate(thread.updatedAt) }
        : {}),
      createdAt: toIsoDate(thread.createdAt),
      updatedAt: toIsoDate(thread.updatedAt)
    }));
}

function buildThreadEntities(
  threads: HermesRuntimeThreadRecord[],
  projectIdByThreadId: Map<string, string>,
  now: number
): Thread[] {
  return [...threads]
    .sort(compareThreadRecency)
    .map((thread) => ({
      kind: "Thread",
      id: createThreadId(thread.id),
      sessionId: createSessionId(thread.id),
      projectId: projectIdByThreadId.get(thread.id) ?? hermesGlobalProjectId,
      title: thread.title || "Hermes thread",
      status: resolveThreadStatus(thread, now),
      summary: summarizeText(
        thread.latestUserMessage,
        "Hermes agent conversation thread"
      ),
      createdAt: toIsoDate(thread.createdAt),
      updatedAt: toIsoDate(thread.updatedAt)
    }));
}

function buildTaskEntities(
  threads: HermesRuntimeThreadRecord[],
  projectIdByThreadId: Map<string, string>,
  now: number
): Task[] {
  return threads
    .flatMap((thread) => {
      const sessionStatus = resolveSessionStatus(thread, now);
      const sortedTurns = [...thread.turns].sort(compareTurnRecency);

      return sortedTurns.map((turn, index) => ({
        kind: "Task" as const,
        id: createTaskId(thread.id, turn.id),
        sessionId: createSessionId(thread.id),
        threadId: createThreadId(thread.id),
        projectId: projectIdByThreadId.get(thread.id) ?? hermesGlobalProjectId,
        title: summarizeText(turn.prompt, "Hermes turn"),
        status: resolveTaskStatus(sessionStatus, index === 0, Boolean(turn.response)),
        priority: resolveTaskPriority(turn, now),
        summary: summarizeText(
          turn.prompt,
          thread.title || "Captured from the linked Hermes thread."
        ),
        createdAt: toIsoDate(turn.timestamp),
        updatedAt: toIsoDate(turn.timestamp)
      }));
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function createOpenedEvent(
  thread: HermesRuntimeThreadRecord,
  projectId: string
): Event {
  const timestamp = toIsoDate(thread.createdAt);

  return {
    kind: "Event",
    id: createOpenedEventId(thread.id),
    projectId,
    sessionId: createSessionId(thread.id),
    threadId: createThreadId(thread.id),
    originType: "system",
    eventType: "hermes_thread_opened",
    category: "lifecycle",
    nodeCategory: "anchor",
    timestamp,
    summary: `Opened Hermes thread: ${thread.title || "Untitled thread"}.`,
    metadata: {
      source: "hermes",
      workspacePath: normalizeProjectWorkspacePath(thread),
      modelId: thread.modelId,
      modelName: thread.modelName
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function createUserEvent(
  thread: HermesRuntimeThreadRecord,
  turn: HermesRuntimeTurnRecord,
  projectId: string
): Event {
  const timestamp = toIsoDate(turn.timestamp);

  return {
    kind: "Event",
    id: createUserEventId(thread.id, turn.id),
    projectId,
    sessionId: createSessionId(thread.id),
    threadId: createThreadId(thread.id),
    taskId: createTaskId(thread.id, turn.id),
    originType: "user",
    eventType: "hermes_user_message",
    category: "system_user",
    nodeCategory: "marker",
    timestamp,
    summary: summarizeText(turn.prompt, "Hermes user prompt"),
    metadata: {
      source: "hermes",
      modelId: turn.modelId,
      referencedFiles: turn.referencedFiles
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function createResponseEvent(
  thread: HermesRuntimeThreadRecord,
  turn: HermesRuntimeTurnRecord,
  projectId: string
): Event {
  const timestamp = toIsoDate(turn.timestamp);

  return {
    kind: "Event",
    id: createResponseEventId(thread.id, turn.id),
    projectId,
    sessionId: createSessionId(thread.id),
    threadId: createThreadId(thread.id),
    taskId: createTaskId(thread.id, turn.id),
    originType: "system",
    eventType: "hermes_response",
    category: "system_user",
    nodeCategory: "marker",
    timestamp,
    summary: summarizeText(turn.response, "Hermes responded."),
    metadata: {
      source: "hermes",
      modelId: turn.modelId,
      toolNames: turn.toolNames
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function createChangeEvent(
  thread: HermesRuntimeThreadRecord,
  turn: HermesRuntimeTurnRecord,
  projectId: string
): Event {
  const timestamp = toIsoDate(turn.timestamp);

  return {
    kind: "Event",
    id: createChangeEventId(thread.id, turn.id),
    projectId,
    sessionId: createSessionId(thread.id),
    threadId: createThreadId(thread.id),
    taskId: createTaskId(thread.id, turn.id),
    originType: "system",
    eventType: "hermes_file_change",
    category: "work_change",
    nodeCategory: "change",
    timestamp,
    summary:
      turn.fileChanges.length === 1
        ? `Hermes changed ${turn.fileChanges[0]!.path}.`
        : `Hermes changed ${turn.fileChanges.length} files.`,
    metadata: {
      source: "hermes",
      modelId: turn.modelId,
      toolNames: turn.toolNames,
      changedFiles: turn.fileChanges.map((fileChange) => fileChange.path)
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function buildEventEntities(
  threads: HermesRuntimeThreadRecord[],
  projectIdByThreadId: Map<string, string>
): Event[] {
  return threads
    .flatMap((thread) => {
      const projectId = projectIdByThreadId.get(thread.id) ?? hermesGlobalProjectId;
      const events: Event[] = [createOpenedEvent(thread, projectId)];
      const sortedTurns = [...thread.turns].sort(compareTurnRecency);

      for (const turn of sortedTurns) {
        events.push(createUserEvent(thread, turn, projectId));

        if (turn.response) {
          events.push(createResponseEvent(thread, turn, projectId));
        }

        if (turn.fileChanges.length > 0) {
          events.push(createChangeEvent(thread, turn, projectId));
        }
      }

      return events;
    })
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

function buildFileChangeEntities(
  threads: HermesRuntimeThreadRecord[],
  projectIdByThreadId: Map<string, string>
): FileChange[] {
  return threads
    .flatMap((thread) =>
      thread.turns.flatMap((turn) =>
        turn.fileChanges.map((fileChange, index) => {
          const language = inferLanguage(fileChange.path);
          const timestamp = toIsoDate(turn.timestamp);
          const entity: FileChange = {
            kind: "FileChange",
            id: createFileChangeId(thread.id, turn.id, index),
            eventId: createChangeEventId(thread.id, turn.id),
            projectId: projectIdByThreadId.get(thread.id) ?? hermesGlobalProjectId,
            sessionId: createSessionId(thread.id),
            threadId: createThreadId(thread.id),
            taskId: createTaskId(thread.id, turn.id),
            path: fileChange.path,
            changeType: fileChange.changeType ?? "updated",
            summary: fileChange.summary ?? `Hermes changed ${fileChange.path}.`,
            fileType: inferFileType(fileChange.path),
            createdAt: timestamp,
            updatedAt: timestamp
          };

          if (fileChange.fromPath) {
            entity.fromPath = fileChange.fromPath;
          }

          if (fileChange.diffPreview) {
            entity.diffPreview = fileChange.diffPreview;
          }

          if (language) {
            entity.language = language;
          }

          return entity;
        })
      )
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function createStoreSnapshotFromHermesRuntimeFeed(
  feed: HermesRuntimeFeed,
  now: number = Date.now()
): SubMindStoreSnapshot {
  const threads = [...feed.threads].sort(compareThreadRecency);
  const projectBuckets = groupThreadsByProject(threads);
  const projectIdByThreadId = new Map(
    projectBuckets.flatMap((bucket) =>
      bucket.threads.map((thread) => [thread.id, bucket.id] as const)
    )
  );
  const projects = buildProjectEntities(projectBuckets);
  const sessionEntities = buildSessionEntities(threads, projectIdByThreadId, now);
  const threadEntities = buildThreadEntities(threads, projectIdByThreadId, now);
  const tasks = buildTaskEntities(threads, projectIdByThreadId, now);
  const events = buildEventEntities(threads, projectIdByThreadId);
  const fileChanges = buildFileChangeEntities(threads, projectIdByThreadId);
  const profile: Profile = {
    kind: "Profile",
    id: profileId,
    displayName: feed.profileName || "Operator",
    ...(projects[0] ? { defaultProjectId: projects[0].id } : {}),
    metadata: {
      source: "hermes_local",
      threadCount: threads.length
    },
    createdAt: projects[projects.length - 1]?.createdAt ?? new Date(now).toISOString(),
    updatedAt: projects[0]?.updatedAt ?? new Date(now).toISOString()
  };

  return {
    profiles: projects.length > 0 ? [profile] : [],
    projects,
    sessions: sessionEntities,
    threads: threadEntities,
    tasks,
    events,
    fileChanges,
    memory: [],
    guidance: [],
    actions: []
  };
}

export function createHermesProtocolEnvelope(
  snapshot: SubMindStoreSnapshot,
  sessionId: string,
  threadId: string
): HermesProtocolEnvelope {
  const events = snapshot.events.filter(
    (event) => event.sessionId === sessionId && event.threadId === threadId
  );
  const fileChanges = snapshot.fileChanges.filter(
    (fileChange) =>
      fileChange.sessionId === sessionId && fileChange.threadId === threadId
  );

  return {
    source: "hermes",
    receivedAt:
      events[0]?.timestamp ??
      fileChanges[0]?.updatedAt ??
      new Date().toISOString(),
    sessionId,
    threadId,
    events,
    fileChanges
  };
}
