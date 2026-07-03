import {
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

export interface CopilotRuntimeRequestRecord {
  id: string;
  timestamp: number;
  message: string;
  response: string | null;
  command: string | null;
  modelId: string | null;
  referencedFiles: string[];
  editedFiles: string[];
  toolNames: string[];
}

export interface CopilotRuntimeSessionRecord {
  id: string;
  title: string;
  workspacePath: string | null;
  storageKey: string;
  source: "workspace" | "empty_window";
  createdAt: number;
  updatedAt: number;
  responderUsername: string | null;
  mode: string | null;
  modelIdentifier: string | null;
  modelName: string | null;
  latestUserMessage: string | null;
  requests: CopilotRuntimeRequestRecord[];
}

export interface CopilotRuntimeFeed {
  profileName: string;
  sessions: CopilotRuntimeSessionRecord[];
}

interface RuntimeProjectBucket {
  id: string;
  key: string;
  workspacePath: string | null;
  source: CopilotRuntimeSessionRecord["source"];
  sessions: CopilotRuntimeSessionRecord[];
}

const profileId = "profile-local-operator";
const emptyWindowProjectId = "project-vscode-empty-window";
const emptyWindowProjectKey = "copilot-empty-window";
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

function compareSessionRecency(
  left: CopilotRuntimeSessionRecord,
  right: CopilotRuntimeSessionRecord
): number {
  return right.updatedAt - left.updatedAt || right.createdAt - left.createdAt;
}

function toIsoDate(value: number): ISODateString {
  return new Date(value).toISOString();
}

function getIdleHours(updatedAt: number, now: number): number {
  return Math.max(0, now - updatedAt) / millisecondsPerHour;
}

function resolveSessionStatus(
  session: CopilotRuntimeSessionRecord,
  now: number
): Session["status"] {
  const idleHours = getIdleHours(session.updatedAt, now);

  if (idleHours <= 6) {
    return "active";
  }

  if (idleHours <= 72) {
    return "idle";
  }

  return "completed";
}

function resolveThreadStatus(
  session: CopilotRuntimeSessionRecord,
  now: number
): Thread["status"] {
  const idleHours = getIdleHours(session.updatedAt, now);

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
  isLatestRequest: boolean,
  hasResponse: boolean
): Task["status"] {
  if (!hasResponse) {
    return "active";
  }

  if (isLatestRequest && sessionStatus === "active") {
    return "active";
  }

  if (isLatestRequest && sessionStatus === "idle") {
    return "queued";
  }

  return "completed";
}

function resolveTaskPriority(
  request: CopilotRuntimeRequestRecord,
  now: number
): Task["priority"] {
  const idleHours = getIdleHours(request.timestamp, now);

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

function normalizeProjectWorkspacePath(
  session: CopilotRuntimeSessionRecord
): string | null {
  if (!session.workspacePath) {
    return null;
  }

  const normalized = normalizeWorkspacePath(session.workspacePath);
  return normalized || null;
}

function getProjectKey(session: CopilotRuntimeSessionRecord): string {
  const workspacePath = normalizeProjectWorkspacePath(session);

  if (!workspacePath) {
    return session.source === "empty_window"
      ? `${emptyWindowProjectKey}:${session.source}`
      : `copilot-workspace:${session.storageKey}`;
  }

  return workspacePath.toLowerCase();
}

function getProjectId(session: CopilotRuntimeSessionRecord): string {
  const workspacePath = normalizeProjectWorkspacePath(session);

  if (!workspacePath) {
    return session.source === "empty_window"
      ? emptyWindowProjectId
      : `project-copilot-workspace-${session.storageKey}`;
  }

  return createProjectIdFromWorkspacePath(workspacePath);
}

function createSessionId(sessionId: string): string {
  return `session-copilot-${sessionId}`;
}

function createThreadId(sessionId: string): string {
  return `thread-copilot-${sessionId}`;
}

function createTaskId(sessionId: string, requestId: string): string {
  return `task-copilot-${sessionId}-${requestId}`;
}

function createOpenedEventId(sessionId: string): string {
  return `event-copilot-${sessionId}-opened`;
}

function createUserEventId(sessionId: string, requestId: string): string {
  return `event-copilot-${sessionId}-${requestId}-user`;
}

function createResponseEventId(sessionId: string, requestId: string): string {
  return `event-copilot-${sessionId}-${requestId}-response`;
}

function createChangeEventId(sessionId: string, requestId: string): string {
  return `event-copilot-${sessionId}-${requestId}-change`;
}

function createFileChangeId(
  sessionId: string,
  requestId: string,
  index: number
): string {
  return `file-change-copilot-${sessionId}-${requestId}-${index}`;
}

function groupSessionsByProject(
  sessions: CopilotRuntimeSessionRecord[]
): RuntimeProjectBucket[] {
  const buckets = new Map<string, RuntimeProjectBucket>();

  for (const session of sessions) {
    const key = getProjectKey(session);
    const workspacePath = normalizeProjectWorkspacePath(session);
    const existingBucket = buckets.get(key);

    if (existingBucket) {
      existingBucket.sessions.push({
        ...session,
        ...(workspacePath ? { workspacePath } : { workspacePath: null })
      });
      continue;
    }

    buckets.set(key, {
      id: getProjectId(session),
      key,
      workspacePath,
      source: session.source,
      sessions: [
        {
          ...session,
          ...(workspacePath ? { workspacePath } : { workspacePath: null })
        }
      ]
    });
  }

  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      sessions: [...bucket.sessions].sort(compareSessionRecency)
    }))
    .sort((left, right) => compareSessionRecency(left.sessions[0]!, right.sessions[0]!));
}

function buildProjectEntities(buckets: RuntimeProjectBucket[]): Project[] {
  return buckets.map((bucket) => {
    const newestSession = bucket.sessions[0]!;
    const oldestSession =
      bucket.sessions[bucket.sessions.length - 1] ?? newestSession;
    const descriptors = [
      "vscode",
      "copilot",
      ...(bucket.source === "empty_window" ? ["unscoped"] : [])
    ];

    if (bucket.workspacePath) {
      return {
        kind: "Project",
        id: bucket.id,
        profileId,
        name: getWorkspaceBaseName(bucket.workspacePath),
        description: "GitHub Copilot activity captured from VS Code chat sessions.",
        summary: summarizeText(
          newestSession.latestUserMessage,
          newestSession.title || "VS Code Copilot chat activity."
        ),
        workspacePath: bucket.workspacePath,
        descriptors,
        createdAt: toIsoDate(oldestSession.createdAt),
        updatedAt: toIsoDate(newestSession.updatedAt)
      };
    }

    return {
      kind: "Project",
      id: bucket.id,
      profileId,
      name:
        bucket.source === "empty_window"
          ? "VS Code Empty Window"
          : "VS Code Workspace Chat",
      description:
        bucket.source === "empty_window"
          ? "GitHub Copilot activity captured from unscoped VS Code chat sessions."
          : "GitHub Copilot activity captured from a VS Code workspace whose root could not be resolved.",
      summary: summarizeText(
        newestSession.latestUserMessage,
        newestSession.title ||
          (bucket.source === "empty_window"
            ? "Unscoped VS Code Copilot chat activity."
            : "VS Code Copilot workspace chat activity.")
      ),
      descriptors,
      createdAt: toIsoDate(oldestSession.createdAt),
      updatedAt: toIsoDate(newestSession.updatedAt)
    };
  });
}

function buildSessionEntities(
  sessions: CopilotRuntimeSessionRecord[],
  projectIdBySessionId: Map<string, string>,
  now: number
): Session[] {
  return [...sessions]
    .sort(compareSessionRecency)
    .map((session) => ({
      kind: "Session",
      id: createSessionId(session.id),
      profileId,
      projectId: projectIdBySessionId.get(session.id) ?? emptyWindowProjectId,
      status: resolveSessionStatus(session, now),
      summary: summarizeText(
        session.latestUserMessage,
        session.title || "VS Code Copilot chat session"
      ),
      startedAt: toIsoDate(session.createdAt),
      ...(resolveSessionStatus(session, now) === "completed"
        ? { completedAt: toIsoDate(session.updatedAt) }
        : {}),
      createdAt: toIsoDate(session.createdAt),
      updatedAt: toIsoDate(session.updatedAt)
    }));
}

function buildThreadEntities(
  sessions: CopilotRuntimeSessionRecord[],
  projectIdBySessionId: Map<string, string>,
  now: number
): Thread[] {
  return [...sessions]
    .sort(compareSessionRecency)
    .map((session) => ({
      kind: "Thread",
      id: createThreadId(session.id),
      sessionId: createSessionId(session.id),
      projectId: projectIdBySessionId.get(session.id) ?? emptyWindowProjectId,
      title: session.title || "GitHub Copilot chat",
      status: resolveThreadStatus(session, now),
      summary: summarizeText(
        session.latestUserMessage,
        "VS Code Copilot conversation thread"
      ),
      createdAt: toIsoDate(session.createdAt),
      updatedAt: toIsoDate(session.updatedAt)
    }));
}

function buildTaskEntities(
  sessions: CopilotRuntimeSessionRecord[],
  projectIdBySessionId: Map<string, string>,
  now: number
): Task[] {
  return sessions
    .flatMap((session) => {
      const sessionStatus = resolveSessionStatus(session, now);
      const sortedRequests = [...session.requests].sort(
        (left, right) => right.timestamp - left.timestamp
      );

      return sortedRequests.map((request, index) => ({
        kind: "Task" as const,
        id: createTaskId(session.id, request.id),
        sessionId: createSessionId(session.id),
        threadId: createThreadId(session.id),
        projectId: projectIdBySessionId.get(session.id) ?? emptyWindowProjectId,
        title:
          request.command
            ? `/${request.command} ${summarizeText(request.message, "Copilot request")}`
            : summarizeText(request.message, "Copilot request"),
        status: resolveTaskStatus(
          sessionStatus,
          index === 0,
          Boolean(request.response)
        ),
        priority: resolveTaskPriority(request, now),
        summary: summarizeText(
          request.message,
          session.title || "Captured from the linked Copilot session."
        ),
        createdAt: toIsoDate(request.timestamp),
        updatedAt: toIsoDate(request.timestamp)
      }));
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function createOpenedEvent(
  session: CopilotRuntimeSessionRecord,
  projectId: string
): Event {
  return {
    kind: "Event",
    id: createOpenedEventId(session.id),
    projectId,
    sessionId: createSessionId(session.id),
    threadId: createThreadId(session.id),
    originType: "system",
    eventType: "copilot_session_opened",
    category: "lifecycle",
    nodeCategory: "anchor",
    timestamp: toIsoDate(session.createdAt),
    summary: `Opened GitHub Copilot chat: ${session.title || "Untitled chat"}.`,
    metadata: {
      source: "copilot",
      chatSource: session.source,
      workspacePath: normalizeProjectWorkspacePath(session),
      mode: session.mode,
      modelIdentifier: session.modelIdentifier,
      modelName: session.modelName
    },
    createdAt: toIsoDate(session.createdAt),
    updatedAt: toIsoDate(session.createdAt)
  };
}

function createUserEvent(
  session: CopilotRuntimeSessionRecord,
  request: CopilotRuntimeRequestRecord,
  projectId: string
): Event {
  return {
    kind: "Event",
    id: createUserEventId(session.id, request.id),
    projectId,
    sessionId: createSessionId(session.id),
    threadId: createThreadId(session.id),
    taskId: createTaskId(session.id, request.id),
    originType: "user",
    eventType: "copilot_user_message",
    category: "system_user",
    nodeCategory: "marker",
    timestamp: toIsoDate(request.timestamp),
    summary: summarizeText(request.message, "Copilot request"),
    metadata: {
      source: "copilot",
      command: request.command,
      modelId: request.modelId,
      referencedFiles: request.referencedFiles
    },
    createdAt: toIsoDate(request.timestamp),
    updatedAt: toIsoDate(request.timestamp)
  };
}

function createResponseEvent(
  session: CopilotRuntimeSessionRecord,
  request: CopilotRuntimeRequestRecord,
  projectId: string
): Event {
  return {
    kind: "Event",
    id: createResponseEventId(session.id, request.id),
    projectId,
    sessionId: createSessionId(session.id),
    threadId: createThreadId(session.id),
    taskId: createTaskId(session.id, request.id),
    originType: "system",
    eventType: "copilot_response",
    category: "system_user",
    nodeCategory: "marker",
    timestamp: toIsoDate(request.timestamp),
    summary: summarizeText(request.response, "GitHub Copilot responded."),
    metadata: {
      source: "copilot",
      command: request.command,
      modelId: request.modelId,
      toolNames: request.toolNames
    },
    createdAt: toIsoDate(request.timestamp),
    updatedAt: toIsoDate(request.timestamp)
  };
}

function createChangeEvent(
  session: CopilotRuntimeSessionRecord,
  request: CopilotRuntimeRequestRecord,
  projectId: string
): Event {
  return {
    kind: "Event",
    id: createChangeEventId(session.id, request.id),
    projectId,
    sessionId: createSessionId(session.id),
    threadId: createThreadId(session.id),
    taskId: createTaskId(session.id, request.id),
    originType: "system",
    eventType: "copilot_edit_applied",
    category: "work_change",
    nodeCategory: "change",
    timestamp: toIsoDate(request.timestamp),
    summary:
      request.editedFiles.length === 1
        ? `GitHub Copilot edited ${request.editedFiles[0]}.`
        : `GitHub Copilot edited ${request.editedFiles.length} files.`,
    metadata: {
      source: "copilot",
      command: request.command,
      modelId: request.modelId,
      editedFiles: request.editedFiles,
      toolNames: request.toolNames
    },
    createdAt: toIsoDate(request.timestamp),
    updatedAt: toIsoDate(request.timestamp)
  };
}

function buildEventEntities(
  sessions: CopilotRuntimeSessionRecord[],
  projectIdBySessionId: Map<string, string>
): Event[] {
  return sessions
    .flatMap((session) => {
      const projectId = projectIdBySessionId.get(session.id) ?? emptyWindowProjectId;
      const events: Event[] = [createOpenedEvent(session, projectId)];
      const sortedRequests = [...session.requests].sort(
        (left, right) => right.timestamp - left.timestamp
      );

      for (const request of sortedRequests) {
        events.push(createUserEvent(session, request, projectId));

        if (request.response) {
          events.push(createResponseEvent(session, request, projectId));
        }

        if (request.editedFiles.length > 0) {
          events.push(createChangeEvent(session, request, projectId));
        }
      }

      return events;
    })
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

function buildFileChangeEntities(
  sessions: CopilotRuntimeSessionRecord[],
  projectIdBySessionId: Map<string, string>
): FileChange[] {
  return sessions
    .flatMap((session) =>
      session.requests.flatMap((request) =>
        request.editedFiles.map((path, index) => {
          const language = inferLanguage(path);
          const timestamp = toIsoDate(request.timestamp);

          return {
            kind: "FileChange" as const,
            id: createFileChangeId(session.id, request.id, index),
            eventId: createChangeEventId(session.id, request.id),
            projectId: projectIdBySessionId.get(session.id) ?? emptyWindowProjectId,
            sessionId: createSessionId(session.id),
            threadId: createThreadId(session.id),
            taskId: createTaskId(session.id, request.id),
            path,
            changeType: "updated" as const,
            summary: `GitHub Copilot edited ${path}.`,
            fileType: inferFileType(path),
            ...(language ? { language } : {}),
            createdAt: timestamp,
            updatedAt: timestamp
          };
        })
      )
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function createStoreSnapshotFromCopilotRuntimeFeed(
  feed: CopilotRuntimeFeed,
  now: number = Date.now()
): SubMindStoreSnapshot {
  const sessions = feed.sessions
    .filter((session) => session.requests.length > 0)
    .sort(compareSessionRecency);
  const projectBuckets = groupSessionsByProject(sessions);
  const projectIdBySessionId = new Map(
    projectBuckets.flatMap((bucket) =>
      bucket.sessions.map((session) => [session.id, bucket.id] as const)
    )
  );
  const projects = buildProjectEntities(projectBuckets);
  const sessionEntities = buildSessionEntities(sessions, projectIdBySessionId, now);
  const threadEntities = buildThreadEntities(sessions, projectIdBySessionId, now);
  const tasks = buildTaskEntities(sessions, projectIdBySessionId, now);
  const events = buildEventEntities(sessions, projectIdBySessionId);
  const fileChanges = buildFileChangeEntities(sessions, projectIdBySessionId);
  const profile: Profile = {
    kind: "Profile",
    id: profileId,
    displayName: feed.profileName || "Operator",
    ...(projects[0] ? { defaultProjectId: projects[0].id } : {}),
    metadata: {
      source: "copilot_local",
      sessionCount: sessions.length
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
