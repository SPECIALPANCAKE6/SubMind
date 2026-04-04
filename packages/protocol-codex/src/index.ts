import type {
  Event,
  FileChange,
  ISODateString,
  Profile,
  Project,
  Session,
  Task,
  Thread
} from "@submind/shared-schemas";
import type { SubMindStoreSnapshot } from "@submind/store";

export interface CodexProtocolEnvelope {
  source: "codex";
  receivedAt: ISODateString;
  sessionId: string;
  threadId: string;
  events: Event[];
  fileChanges: FileChange[];
}

export function createEmptyCodexProtocolEnvelope(
  sessionId: string,
  threadId: string,
  receivedAt: ISODateString
): CodexProtocolEnvelope {
  return {
    source: "codex",
    receivedAt,
    sessionId,
    threadId,
    events: [],
    fileChanges: []
  };
}

export interface CodexRuntimeThreadRecord {
  id: string;
  title: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  gitBranch: string | null;
  gitOriginUrl: string | null;
  firstUserMessage: string | null;
  descriptorHints: string[];
}

export interface CodexRuntimeEventRecord {
  id: string;
  threadId: string;
  timestamp: ISODateString;
  type: string;
  summary: string;
  metadata: Record<string, unknown>;
}

export interface CodexRuntimeFileChangeRecord {
  id: string;
  threadId: string;
  eventId: string;
  timestamp: ISODateString;
  path: string;
  changeType: FileChange["changeType"];
  summary?: string;
}

export interface CodexRuntimeFeed {
  profileName: string;
  threads: CodexRuntimeThreadRecord[];
  events: CodexRuntimeEventRecord[];
  fileChanges: CodexRuntimeFileChangeRecord[];
}

interface RuntimeProjectBucket {
  cwd: string;
  id: string;
  threads: CodexRuntimeThreadRecord[];
}

const millisecondsPerHour = 60 * 60 * 1000;

function sanitizePath(value: string): string {
  return value.replace(/^\\\\\?\\/, "").replaceAll("\\", "/");
}

function getPathSegments(value: string): string[] {
  return sanitizePath(value)
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function getPathBaseName(value: string): string {
  const segments = getPathSegments(value);
  return segments[segments.length - 1] ?? "Workspace";
}

function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function createSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function createStableHash(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function createProjectId(cwd: string): string {
  const baseName = createSlug(getPathBaseName(cwd)) || "workspace";
  return `project-${baseName}-${createStableHash(sanitizePath(cwd))}`;
}

function createSessionId(threadId: string): string {
  return `session-${threadId}`;
}

function createThreadEntityId(threadId: string): string {
  return `thread-${threadId}`;
}

function createTaskId(threadId: string): string {
  return `task-${threadId}`;
}

function toIsoDate(value: number): ISODateString {
  return new Date(value * 1000).toISOString();
}

function summarizeMessage(value: string | null | undefined, fallback: string): string {
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

function createProjectDescription(
  newestThread: CodexRuntimeThreadRecord,
  descriptors: string[]
): string {
  if (descriptors.length > 0) {
    return descriptors.slice(0, 3).join(" / ");
  }

  if (newestThread.gitBranch) {
    return `Branch ${newestThread.gitBranch}`;
  }

  return "Codex-tracked workspace";
}

function getThreadIdleHours(thread: CodexRuntimeThreadRecord, now: number): number {
  const updatedAtMs = thread.updatedAt * 1000;
  return Math.max(0, now - updatedAtMs) / millisecondsPerHour;
}

function resolveSessionStatus(
  thread: CodexRuntimeThreadRecord,
  now: number
): Session["status"] {
  const idleHours = getThreadIdleHours(thread, now);

  if (idleHours <= 6) {
    return "active";
  }

  if (idleHours <= 72) {
    return "idle";
  }

  return "completed";
}

function resolveThreadStatus(
  thread: CodexRuntimeThreadRecord,
  now: number
): Thread["status"] {
  const idleHours = getThreadIdleHours(thread, now);

  if (idleHours <= 6) {
    return "open";
  }

  if (idleHours <= 72) {
    return "idle";
  }

  return "closed";
}

function resolveTaskStatus(status: Thread["status"]): Task["status"] {
  switch (status) {
    case "open":
      return "active";
    case "idle":
      return "queued";
    case "closed":
      return "completed";
    default:
      return "queued";
  }
}

function resolveTaskPriority(
  thread: CodexRuntimeThreadRecord,
  now: number
): Task["priority"] {
  const idleHours = getThreadIdleHours(thread, now);

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

function compareThreadRecency(
  left: CodexRuntimeThreadRecord,
  right: CodexRuntimeThreadRecord
): number {
  return right.updatedAt - left.updatedAt || right.createdAt - left.createdAt;
}

function groupThreadsByProject(
  threads: CodexRuntimeThreadRecord[]
): RuntimeProjectBucket[] {
  const buckets = new Map<string, RuntimeProjectBucket>();

  for (const thread of threads) {
    const cwd = sanitizePath(thread.cwd);
    const existingBucket = buckets.get(cwd);

    if (existingBucket) {
      existingBucket.threads.push({
        ...thread,
        cwd
      });
      continue;
    }

    buckets.set(cwd, {
      cwd,
      id: createProjectId(cwd),
      threads: [
        {
          ...thread,
          cwd
        }
      ]
    });
  }

  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      threads: [...bucket.threads].sort(compareThreadRecency)
    }))
    .sort((left, right) => {
      const leftThread = left.threads[0];
      const rightThread = right.threads[0];

      if (!leftThread || !rightThread) {
        return 0;
      }

      return compareThreadRecency(leftThread, rightThread);
    });
}

function buildProjectEntities(
  buckets: RuntimeProjectBucket[],
  profileId: string
): Project[] {
  return buckets.map((bucket) => {
    const newestThread = bucket.threads[0];
    const oldestThread = bucket.threads[bucket.threads.length - 1] ?? newestThread;
    const descriptorHints = [
      ...new Set(
        bucket.threads.flatMap((thread) => thread.descriptorHints ?? [])
      )
    ].slice(0, 5);

    return {
      kind: "Project",
      id: bucket.id,
      profileId,
      name: getPathBaseName(bucket.cwd),
      description: createProjectDescription(newestThread, descriptorHints),
      summary: summarizeMessage(
        newestThread.firstUserMessage,
        newestThread.title || "Codex-tracked project activity."
      ),
      workspacePath: bucket.cwd,
      ...(newestThread.gitOriginUrl
        ? { repositoryRemote: newestThread.gitOriginUrl }
        : {}),
      descriptors: descriptorHints,
      createdAt: toIsoDate(oldestThread.createdAt),
      updatedAt: toIsoDate(newestThread.updatedAt)
    };
  });
}

function buildSessionEntities(
  threads: CodexRuntimeThreadRecord[],
  projectIdByCwd: Map<string, string>,
  profileId: string,
  now: number
): Session[] {
  return [...threads]
    .sort(compareThreadRecency)
    .map((thread) => ({
      kind: "Session",
      id: createSessionId(thread.id),
      profileId,
      projectId: projectIdByCwd.get(sanitizePath(thread.cwd)) ?? "unknown-project",
      status: resolveSessionStatus(thread, now),
      summary: summarizeMessage(
        thread.firstUserMessage,
        thread.title || "Codex session"
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
  threads: CodexRuntimeThreadRecord[],
  projectIdByCwd: Map<string, string>,
  now: number
): Thread[] {
  return [...threads]
    .sort(compareThreadRecency)
    .map((thread) => ({
      kind: "Thread",
      id: createThreadEntityId(thread.id),
      sessionId: createSessionId(thread.id),
      projectId: projectIdByCwd.get(sanitizePath(thread.cwd)) ?? "unknown-project",
      title: thread.title || getPathBaseName(thread.cwd),
      status: resolveThreadStatus(thread, now),
      summary: summarizeMessage(
        thread.firstUserMessage,
        "Codex work thread"
      ),
      createdAt: toIsoDate(thread.createdAt),
      updatedAt: toIsoDate(thread.updatedAt)
    }));
}

function buildTaskEntities(
  threads: CodexRuntimeThreadRecord[],
  projectIdByCwd: Map<string, string>,
  now: number
): Task[] {
  return [...threads]
    .sort(compareThreadRecency)
    .map((thread) => {
      const threadStatus = resolveThreadStatus(thread, now);

      return {
        kind: "Task",
        id: createTaskId(thread.id),
        sessionId: createSessionId(thread.id),
        threadId: createThreadEntityId(thread.id),
        projectId: projectIdByCwd.get(sanitizePath(thread.cwd)) ?? "unknown-project",
        title: thread.title || "Codex task",
        status: resolveTaskStatus(threadStatus),
        priority: resolveTaskPriority(thread, now),
        summary: summarizeMessage(
          thread.firstUserMessage,
          "Captured from the linked Codex thread."
        ),
        createdAt: toIsoDate(thread.createdAt),
        updatedAt: toIsoDate(thread.updatedAt)
      };
    });
}

function mapRuntimeEvent(
  event: CodexRuntimeEventRecord,
  thread: CodexRuntimeThreadRecord,
  projectId: string
): Event {
  const baseEvent: Event = {
    kind: "Event",
    id: event.id,
    projectId,
    sessionId: createSessionId(thread.id),
    threadId: createThreadEntityId(thread.id),
    taskId: createTaskId(thread.id),
    originType:
      event.type === "user_message"
        ? "user"
        : event.type === "apply_patch"
          ? "codex"
          : "codex",
    eventType: event.type,
    category:
      event.type === "apply_patch"
        ? "work_change"
        : event.type === "user_message"
          ? "system_user"
          : "lifecycle",
    nodeCategory:
      event.type === "apply_patch"
        ? "change"
        : event.type === "user_message"
          ? "marker"
          : "anchor",
    timestamp: event.timestamp,
    summary: event.summary,
    metadata: event.metadata,
    createdAt: event.timestamp,
    updatedAt: event.timestamp
  };

  return baseEvent;
}

function buildEventEntities(
  feed: CodexRuntimeFeed,
  threadsById: Map<string, CodexRuntimeThreadRecord>,
  projectIdByCwd: Map<string, string>
): Event[] {
  return feed.events
    .map((event) => {
      const thread = threadsById.get(event.threadId);

      if (!thread) {
        return null;
      }

      const projectId = projectIdByCwd.get(sanitizePath(thread.cwd));

      if (!projectId) {
        return null;
      }

      return mapRuntimeEvent(event, thread, projectId);
    })
    .filter((event): event is Event => event !== null)
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

function buildFileChangeEntities(
  feed: CodexRuntimeFeed,
  threadsById: Map<string, CodexRuntimeThreadRecord>,
  projectIdByCwd: Map<string, string>,
  threadsByEntityId: Map<string, Thread>
): FileChange[] {
  const eventsById = new Map(feed.events.map((event) => [event.id, event]));
  const fileChanges: Array<FileChange | null> = feed.fileChanges.map((fileChange) => {
      const thread = threadsById.get(fileChange.threadId);

      if (!thread) {
        return null;
      }

      const projectId = projectIdByCwd.get(sanitizePath(thread.cwd));
      const event = eventsById.get(fileChange.eventId);
      const threadEntity = threadsByEntityId.get(createThreadEntityId(thread.id));

      if (!projectId || !event || !threadEntity) {
        return null;
      }

      const language = inferLanguage(fileChange.path);

      return {
        kind: "FileChange",
        id: fileChange.id,
        eventId: fileChange.eventId,
        projectId,
        sessionId: createSessionId(thread.id),
        threadId: threadEntity.id,
        taskId: createTaskId(thread.id),
        path: fileChange.path,
        changeType: fileChange.changeType,
        ...(fileChange.summary ? { summary: fileChange.summary } : {}),
        fileType: inferFileType(fileChange.path),
        ...(language ? { language } : {}),
        gitRef: thread.gitBranch ?? "HEAD",
        createdAt: fileChange.timestamp,
        updatedAt: fileChange.timestamp
      };
    });

  return fileChanges
    .filter((fileChange): fileChange is FileChange => fileChange !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function createStoreSnapshotFromCodexRuntimeFeed(
  feed: CodexRuntimeFeed,
  now: number = Date.now()
): SubMindStoreSnapshot {
  const threads = [...feed.threads].sort(compareThreadRecency);
  const projectBuckets = groupThreadsByProject(threads);
  const profileId = "profile-local-operator";
  const projectIdByCwd = new Map(
    projectBuckets.map((bucket) => [bucket.cwd, bucket.id])
  );
  const projects = buildProjectEntities(projectBuckets, profileId);
  const sessions = buildSessionEntities(threads, projectIdByCwd, profileId, now);
  const threadEntities = buildThreadEntities(threads, projectIdByCwd, now);
  const tasks = buildTaskEntities(threads, projectIdByCwd, now);
  const threadsById = new Map(threads.map((thread) => [thread.id, thread]));
  const threadsByEntityId = new Map(
    threadEntities.map((thread) => [thread.id, thread])
  );
  const events = buildEventEntities(feed, threadsById, projectIdByCwd);
  const fileChanges = buildFileChangeEntities(
    feed,
    threadsById,
    projectIdByCwd,
    threadsByEntityId
  );
  const profile: Profile = {
    kind: "Profile",
    id: profileId,
    displayName: feed.profileName || "Operator",
    ...(projects[0] ? { defaultProjectId: projects[0].id } : {}),
    metadata: {
      source: "codex_local",
      threadCount: threads.length
    },
    createdAt: projects[projects.length - 1]?.createdAt ?? new Date(now).toISOString(),
    updatedAt: projects[0]?.updatedAt ?? new Date(now).toISOString()
  };

  return {
    profiles: projects.length > 0 ? [profile] : [],
    projects,
    sessions,
    threads: threadEntities,
    tasks,
    events,
    fileChanges,
    memory: [],
    guidance: [],
    actions: []
  };
}

export function createCodexProtocolEnvelope(
  snapshot: SubMindStoreSnapshot,
  sessionId: string,
  threadId: string
): CodexProtocolEnvelope {
  const events = snapshot.events.filter(
    (event) => event.sessionId === sessionId && event.threadId === threadId
  );
  const fileChanges = snapshot.fileChanges.filter(
    (fileChange) =>
      fileChange.sessionId === sessionId && fileChange.threadId === threadId
  );

  return {
    source: "codex",
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
