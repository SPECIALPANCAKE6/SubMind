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

export interface MuseProtocolEnvelope {
  source: "muse";
  receivedAt: ISODateString;
  sessionId: string;
  threadId: string;
  events: Event[];
  fileChanges: FileChange[];
}

export function createEmptyMuseProtocolEnvelope(
  sessionId: string,
  threadId: string,
  receivedAt: ISODateString
): MuseProtocolEnvelope {
  return {
    source: "muse",
    receivedAt,
    sessionId,
    threadId,
    events: [],
    fileChanges: []
  };
}

export interface MuseRuntimeFileChangeRecord {
  path: string;
  changeType?: FileChange["changeType"];
  fromPath?: string;
  summary?: string;
  diffPreview?: string;
}

export interface MuseRuntimeTurnRecord {
  id: string;
  timestamp: number;
  prompt: string;
  response: string | null;
  toolNames: string[];
  referencedFiles: string[];
  fileChanges: MuseRuntimeFileChangeRecord[];
}

export interface MuseRuntimeChatRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  workspacePath: string | null;
  descriptorHints: string[];
  turns: MuseRuntimeTurnRecord[];
}

export interface MuseRuntimeFeed {
  profileName: string;
  chats: MuseRuntimeChatRecord[];
}

interface RuntimeProjectBucket {
  id: string;
  key: string;
  workspacePath: string | null;
  chats: MuseRuntimeChatRecord[];
}

const profileId = "profile-local-operator";
const museGlobalProjectId = "project-muse-global";
const museGlobalProjectKey = "muse-global";
const museInboxSessionId = "session-muse-inbox";
const museInboxThreadId = "thread-muse-inbox";
const millisecondsPerHour = 60 * 60 * 1000;

let assignmentSequence = 0;

function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function summarizeText(
  value: string | null | undefined,
  fallback: string
): string {
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
  chat: MuseRuntimeChatRecord
): string | null {
  if (!chat.workspacePath) {
    return null;
  }

  const normalized = normalizeWorkspacePath(chat.workspacePath);
  return normalized || null;
}

function getProjectKey(chat: MuseRuntimeChatRecord): string {
  const workspacePath = normalizeProjectWorkspacePath(chat);

  if (!workspacePath) {
    return museGlobalProjectKey;
  }

  return createProjectGroupingKey(workspacePath);
}

function getProjectId(chat: MuseRuntimeChatRecord): string {
  const workspacePath = normalizeProjectWorkspacePath(chat);

  if (!workspacePath) {
    return museGlobalProjectId;
  }

  return createProjectIdFromWorkspacePath(workspacePath);
}

function createSessionId(chatId: string): string {
  return `session-muse-${chatId}`;
}

function createThreadId(chatId: string): string {
  return `thread-muse-${chatId}`;
}

function createTaskId(chatId: string, turnId: string): string {
  return `task-muse-${chatId}-${turnId}`;
}

function createOpenedEventId(chatId: string): string {
  return `event-muse-${chatId}-opened`;
}

function createUserEventId(chatId: string, turnId: string): string {
  return `event-muse-${chatId}-${turnId}-user`;
}

function createResponseEventId(chatId: string, turnId: string): string {
  return `event-muse-${chatId}-${turnId}-response`;
}

function createChangeEventId(chatId: string, turnId: string): string {
  return `event-muse-${chatId}-${turnId}-change`;
}

function createFileChangeId(
  chatId: string,
  turnId: string,
  index: number
): string {
  return `file-change-muse-${chatId}-${turnId}-${index}`;
}

function compareChatRecency(
  left: MuseRuntimeChatRecord,
  right: MuseRuntimeChatRecord
): number {
  return (
    toEpochMs(right.updatedAt) - toEpochMs(left.updatedAt) ||
    toEpochMs(right.createdAt) - toEpochMs(left.createdAt)
  );
}

function compareTurnRecency(
  left: MuseRuntimeTurnRecord,
  right: MuseRuntimeTurnRecord
): number {
  return toEpochMs(right.timestamp) - toEpochMs(left.timestamp);
}

function resolveSessionStatus(
  chat: MuseRuntimeChatRecord,
  now: number
): Session["status"] {
  const idleHours = getIdleHours(chat.updatedAt, now);

  if (idleHours <= 6) {
    return "active";
  }

  if (idleHours <= 72) {
    return "idle";
  }

  return "completed";
}

function resolveThreadStatus(
  chat: MuseRuntimeChatRecord,
  now: number
): Thread["status"] {
  const idleHours = getIdleHours(chat.updatedAt, now);

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
  turn: MuseRuntimeTurnRecord,
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

  if (
    /\.(ts|tsx|js|jsx|rs|py|go|java|kt|swift|css|scss|html|json|toml|yaml|yml|md)$/.test(
      normalized
    )
  ) {
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

function groupChatsByProject(
  chats: MuseRuntimeChatRecord[]
): RuntimeProjectBucket[] {
  const buckets = new Map<string, RuntimeProjectBucket>();

  for (const chat of chats) {
    const key = getProjectKey(chat);
    const workspacePath = normalizeProjectWorkspacePath(chat);
    const normalizedChat = {
      ...chat,
      workspacePath
    };
    const existingBucket = buckets.get(key);

    if (existingBucket) {
      existingBucket.chats.push(normalizedChat);
      continue;
    }

    buckets.set(key, {
      id: getProjectId(chat),
      key,
      workspacePath,
      chats: [normalizedChat]
    });
  }

  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      chats: [...bucket.chats].sort(compareChatRecency)
    }))
    .sort((left, right) =>
      compareChatRecency(left.chats[0]!, right.chats[0]!)
    );
}

function buildProjectEntities(buckets: RuntimeProjectBucket[]): Project[] {
  return buckets.map((bucket) => {
    const newestChat = bucket.chats[0]!;
    const oldestChat = bucket.chats[bucket.chats.length - 1] ?? newestChat;
    const descriptors = [
      ...new Set([
        "muse",
        "agent",
        ...bucket.chats.flatMap((chat) => chat.descriptorHints)
      ])
    ].slice(0, 6);
    const project: Project = {
      kind: "Project",
      id: bucket.id,
      profileId,
      name: bucket.workspacePath
        ? getWorkspaceBaseName(bucket.workspacePath)
        : "Muse Global Activity",
      description: bucket.workspacePath
        ? "Muse activity captured from local agent chats for this workspace."
        : "Muse activity captured without a resolved workspace.",
      summary: summarizeText(
        newestChat.turns[0]?.prompt ?? null,
        newestChat.title || "Muse agent activity."
      ),
      descriptors,
      createdAt: toIsoDate(oldestChat.createdAt),
      updatedAt: toIsoDate(newestChat.updatedAt)
    };

    if (bucket.workspacePath) {
      project.workspacePath = bucket.workspacePath;
    }

    return project;
  });
}

function buildSessionEntities(
  chats: MuseRuntimeChatRecord[],
  projectIdByChatId: Map<string, string>,
  now: number
): Session[] {
  return [...chats]
    .sort(compareChatRecency)
    .map((chat) => ({
      kind: "Session",
      id: createSessionId(chat.id),
      profileId,
      projectId: projectIdByChatId.get(chat.id) ?? museGlobalProjectId,
      status: resolveSessionStatus(chat, now),
      summary: summarizeText(
        chat.turns[0]?.prompt ?? null,
        chat.title || "Muse agent session"
      ),
      startedAt: toIsoDate(chat.createdAt),
      ...(resolveSessionStatus(chat, now) === "completed"
        ? { completedAt: toIsoDate(chat.updatedAt) }
        : {}),
      createdAt: toIsoDate(chat.createdAt),
      updatedAt: toIsoDate(chat.updatedAt)
    }));
}

function buildThreadEntities(
  chats: MuseRuntimeChatRecord[],
  projectIdByChatId: Map<string, string>,
  now: number
): Thread[] {
  return [...chats]
    .sort(compareChatRecency)
    .map((chat) => ({
      kind: "Thread",
      id: createThreadId(chat.id),
      sessionId: createSessionId(chat.id),
      projectId: projectIdByChatId.get(chat.id) ?? museGlobalProjectId,
      title: chat.title || "Muse chat",
      status: resolveThreadStatus(chat, now),
      summary: summarizeText(
        chat.turns[0]?.prompt ?? null,
        "Muse agent conversation thread"
      ),
      createdAt: toIsoDate(chat.createdAt),
      updatedAt: toIsoDate(chat.updatedAt)
    }));
}

function buildTaskEntities(
  chats: MuseRuntimeChatRecord[],
  projectIdByChatId: Map<string, string>,
  now: number
): Task[] {
  return chats
    .flatMap((chat) => {
      const sessionStatus = resolveSessionStatus(chat, now);
      const sortedTurns = [...chat.turns].sort(compareTurnRecency);

      return sortedTurns.map((turn, index) => ({
        kind: "Task" as const,
        id: createTaskId(chat.id, turn.id),
        sessionId: createSessionId(chat.id),
        threadId: createThreadId(chat.id),
        projectId: projectIdByChatId.get(chat.id) ?? museGlobalProjectId,
        title: summarizeText(turn.prompt, "Muse turn"),
        status: resolveTaskStatus(
          sessionStatus,
          index === 0,
          Boolean(turn.response)
        ),
        priority: resolveTaskPriority(turn, now),
        summary: summarizeText(
          turn.prompt,
          chat.title || "Captured from the linked Muse chat."
        ),
        createdAt: toIsoDate(turn.timestamp),
        updatedAt: toIsoDate(turn.timestamp)
      }));
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function createOpenedEvent(
  chat: MuseRuntimeChatRecord,
  projectId: string
): Event {
  const timestamp = toIsoDate(chat.createdAt);

  return {
    kind: "Event",
    id: createOpenedEventId(chat.id),
    projectId,
    sessionId: createSessionId(chat.id),
    threadId: createThreadId(chat.id),
    originType: "system",
    eventType: "muse_chat_opened",
    category: "lifecycle",
    nodeCategory: "anchor",
    timestamp,
    summary: `Opened Muse chat: ${chat.title || "Untitled chat"}.`,
    metadata: {
      source: "muse",
      workspacePath: normalizeProjectWorkspacePath(chat)
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function createUserEvent(
  chat: MuseRuntimeChatRecord,
  turn: MuseRuntimeTurnRecord,
  projectId: string
): Event {
  const timestamp = toIsoDate(turn.timestamp);

  return {
    kind: "Event",
    id: createUserEventId(chat.id, turn.id),
    projectId,
    sessionId: createSessionId(chat.id),
    threadId: createThreadId(chat.id),
    taskId: createTaskId(chat.id, turn.id),
    originType: "user",
    eventType: "muse_user_message",
    category: "system_user",
    nodeCategory: "marker",
    timestamp,
    summary: summarizeText(turn.prompt, "Muse user prompt"),
    metadata: {
      source: "muse",
      referencedFiles: turn.referencedFiles
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function createResponseEvent(
  chat: MuseRuntimeChatRecord,
  turn: MuseRuntimeTurnRecord,
  projectId: string
): Event {
  const timestamp = toIsoDate(turn.timestamp);

  return {
    kind: "Event",
    id: createResponseEventId(chat.id, turn.id),
    projectId,
    sessionId: createSessionId(chat.id),
    threadId: createThreadId(chat.id),
    taskId: createTaskId(chat.id, turn.id),
    originType: "system",
    eventType: "muse_response",
    category: "system_user",
    nodeCategory: "marker",
    timestamp,
    summary: summarizeText(turn.response, "Muse responded."),
    metadata: {
      source: "muse",
      toolNames: turn.toolNames
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function createChangeEvent(
  chat: MuseRuntimeChatRecord,
  turn: MuseRuntimeTurnRecord,
  projectId: string
): Event {
  const timestamp = toIsoDate(turn.timestamp);

  return {
    kind: "Event",
    id: createChangeEventId(chat.id, turn.id),
    projectId,
    sessionId: createSessionId(chat.id),
    threadId: createThreadId(chat.id),
    taskId: createTaskId(chat.id, turn.id),
    originType: "system",
    eventType: "muse_file_change",
    category: "work_change",
    nodeCategory: "change",
    timestamp,
    summary:
      turn.fileChanges.length === 1
        ? `Muse changed ${turn.fileChanges[0]!.path}.`
        : `Muse changed ${turn.fileChanges.length} files.`,
    metadata: {
      source: "muse",
      toolNames: turn.toolNames,
      changedFiles: turn.fileChanges.map((fileChange) => fileChange.path)
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function buildEventEntities(
  chats: MuseRuntimeChatRecord[],
  projectIdByChatId: Map<string, string>
): Event[] {
  return chats
    .flatMap((chat) => {
      const projectId =
        projectIdByChatId.get(chat.id) ?? museGlobalProjectId;
      const events: Event[] = [createOpenedEvent(chat, projectId)];
      const sortedTurns = [...chat.turns].sort(compareTurnRecency);

      for (const turn of sortedTurns) {
        events.push(createUserEvent(chat, turn, projectId));

        if (turn.response) {
          events.push(createResponseEvent(chat, turn, projectId));
        }

        if (turn.fileChanges.length > 0) {
          events.push(createChangeEvent(chat, turn, projectId));
        }
      }

      return events;
    })
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

function buildFileChangeEntities(
  chats: MuseRuntimeChatRecord[],
  projectIdByChatId: Map<string, string>
): FileChange[] {
  return chats
    .flatMap((chat) =>
      chat.turns.flatMap((turn) =>
        turn.fileChanges.map((fileChange, index) => {
          const language = inferLanguage(fileChange.path);
          const timestamp = toIsoDate(turn.timestamp);
          const entity: FileChange = {
            kind: "FileChange",
            id: createFileChangeId(chat.id, turn.id, index),
            eventId: createChangeEventId(chat.id, turn.id),
            projectId: projectIdByChatId.get(chat.id) ?? museGlobalProjectId,
            sessionId: createSessionId(chat.id),
            threadId: createThreadId(chat.id),
            taskId: createTaskId(chat.id, turn.id),
            path: fileChange.path,
            changeType: fileChange.changeType ?? "updated",
            summary: fileChange.summary ?? `Muse changed ${fileChange.path}.`,
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

export function createStoreSnapshotFromMuseRuntimeFeed(
  feed: MuseRuntimeFeed,
  now: number = Date.now()
): SubMindStoreSnapshot {
  const chats = [...feed.chats].sort(compareChatRecency);
  const projectBuckets = groupChatsByProject(chats);
  const projectIdByChatId = new Map(
    projectBuckets.flatMap((bucket) =>
      bucket.chats.map((chat) => [chat.id, bucket.id] as const)
    )
  );
  const projects = buildProjectEntities(projectBuckets);
  const sessionEntities = buildSessionEntities(chats, projectIdByChatId, now);
  const threadEntities = buildThreadEntities(chats, projectIdByChatId, now);
  const tasks = buildTaskEntities(chats, projectIdByChatId, now);
  const events = buildEventEntities(chats, projectIdByChatId);
  const fileChanges = buildFileChangeEntities(chats, projectIdByChatId);
  const profile: Profile = {
    kind: "Profile",
    id: profileId,
    displayName: feed.profileName || "Operator",
    ...(projects[0] ? { defaultProjectId: projects[0].id } : {}),
    metadata: {
      source: "muse_local",
      chatCount: chats.length
    },
    createdAt:
      projects[projects.length - 1]?.createdAt ?? new Date(now).toISOString(),
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

export function createMuseProtocolEnvelope(
  snapshot: SubMindStoreSnapshot,
  sessionId: string,
  threadId: string
): MuseProtocolEnvelope {
  const events = snapshot.events.filter(
    (event) => event.sessionId === sessionId && event.threadId === threadId
  );
  const fileChanges = snapshot.fileChanges.filter(
    (fileChange) =>
      fileChange.sessionId === sessionId && fileChange.threadId === threadId
  );

  return {
    source: "muse",
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

export interface MuseTaskAssignmentInput {
  title: string;
  summary?: string;
  priority?: Task["priority"];
  projectId?: string;
  sessionId?: string;
  threadId?: string;
  id?: string;
  createdAt?: number;
}

/**
 * Builds a queued Task entity addressed to the Muse runtime.
 *
 * Convention: tasks created through this helper live in the Muse inbox scope
 * (`session-muse-inbox` / `thread-muse-inbox`) unless the caller pins them to
 * an existing session/thread. The SubMind console (or a bridge polling the
 * store) delivers `queued` Muse tasks to the Muse runtime; the runtime reports
 * back by emitting `muse_response` / `muse_file_change` events for the task.
 */
export function createMuseTaskAssignment(
  input: MuseTaskAssignmentInput,
  now: number = Date.now()
): Task {
  assignmentSequence += 1;
  const timestamp = toIsoDate(input.createdAt ?? now);
  const task: Task = {
    kind: "Task",
    id: input.id ?? `task-muse-inbox-${now}-${assignmentSequence}`,
    sessionId: input.sessionId ?? museInboxSessionId,
    threadId: input.threadId ?? museInboxThreadId,
    projectId: input.projectId ?? museGlobalProjectId,
    title: input.title,
    status: "queued",
    priority: input.priority ?? "medium",
    createdAt: timestamp,
    updatedAt: timestamp
  };

  if (input.summary) {
    task.summary = input.summary;
  }

  return task;
}

export const museInboxScope = {
  projectId: museGlobalProjectId,
  sessionId: museInboxSessionId,
  threadId: museInboxThreadId
} as const;
