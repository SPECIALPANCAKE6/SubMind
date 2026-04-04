import type {
  ActionItem,
  Event,
  FileChange,
  GuidanceItem,
  MemoryItem,
  Profile,
  Project,
  Session,
  Task,
  Thread
} from "@submind/shared-schemas";
import type {
  ActionStateTransitionInput,
  EventHistoryQueryInput,
  FileChangeHistoryQueryInput,
  SubMindRepository,
  SubMindStoreSnapshot
} from "./index.js";

export interface SubMindSqlQueryResult {
  rowsAffected: number;
  lastInsertId?: number | null;
}

export interface SubMindSqlDatabase {
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
  execute(
    query: string,
    bindValues?: unknown[]
  ): Promise<SubMindSqlQueryResult>;
}

export interface CreateSqliteRepositoryOptions {
  db: SubMindSqlDatabase;
  seedSnapshot?: SubMindStoreSnapshot;
  now?: () => string;
}

export const subMindSqliteDatabasePath = "sqlite:submind.db";
const runtimeSourceKey = "runtime_source";
const runtimeSourceValue = "codex_local_v1";

const createTableStatements = [
  `CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    display_name TEXT NOT NULL,
    default_project_id TEXT,
    metadata_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    summary TEXT,
    workspace_path TEXT,
    repository_remote TEXT,
    descriptors_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    status TEXT NOT NULL,
    summary TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    session_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    summary TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    session_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    priority TEXT NOT NULL,
    summary TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    project_id TEXT NOT NULL,
    session_id TEXT,
    thread_id TEXT,
    task_id TEXT,
    file_change_id TEXT,
    guidance_item_id TEXT,
    action_item_id TEXT,
    memory_item_id TEXT,
    origin_type TEXT NOT NULL,
    event_type TEXT NOT NULL,
    category TEXT NOT NULL,
    node_category TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    summary TEXT NOT NULL,
    metadata_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS file_changes (
    id TEXT PRIMARY KEY NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    event_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    session_id TEXT,
    thread_id TEXT,
    task_id TEXT,
    path TEXT NOT NULL,
    change_type TEXT NOT NULL,
    from_path TEXT,
    summary TEXT,
    diff_preview TEXT,
    language TEXT,
    file_type TEXT NOT NULL,
    git_ref TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS memory_items (
    id TEXT PRIMARY KEY NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    project_id TEXT,
    session_id TEXT,
    thread_id TEXT,
    bucket TEXT NOT NULL,
    status TEXT NOT NULL,
    summary TEXT NOT NULL,
    content TEXT NOT NULL,
    confidence TEXT NOT NULL,
    freshness TEXT NOT NULL,
    is_pinned TEXT NOT NULL,
    is_edited TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS guidance_items (
    id TEXT PRIMARY KEY NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    project_id TEXT NOT NULL,
    session_id TEXT,
    thread_id TEXT,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    rationale TEXT NOT NULL,
    state TEXT NOT NULL,
    source TEXT NOT NULL,
    linked_memory_item_ids_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS action_items (
    id TEXT PRIMARY KEY NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    project_id TEXT NOT NULL,
    session_id TEXT,
    thread_id TEXT,
    title TEXT NOT NULL,
    summary TEXT,
    state TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    risk_summary TEXT NOT NULL,
    risk_factors_json TEXT NOT NULL,
    expected_outcome TEXT,
    actual_outcome TEXT,
    owner TEXT NOT NULL
  )`
] as const;

const clearAllDataStatements = [
  "DELETE FROM action_items",
  "DELETE FROM guidance_items",
  "DELETE FROM memory_items",
  "DELETE FROM file_changes",
  "DELETE FROM events",
  "DELETE FROM tasks",
  "DELETE FROM threads",
  "DELETE FROM sessions",
  "DELETE FROM projects",
  "DELETE FROM profiles"
] as const;

const clearCoreDataStatements = [
  "DELETE FROM file_changes",
  "DELETE FROM events",
  "DELETE FROM tasks",
  "DELETE FROM threads",
  "DELETE FROM sessions",
  "DELETE FROM projects",
  "DELETE FROM profiles"
] as const;

interface ProfileRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  displayName: string;
  defaultProjectId: string | null;
  metadataJson: string;
}

interface ProjectRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  profileId: string;
  name: string;
  description: string | null;
  summary: string | null;
  workspacePath: string | null;
  repositoryRemote: string | null;
  descriptorsJson: string;
}

interface SessionRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  profileId: string;
  projectId: string;
  status: Session["status"];
  summary: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface ThreadRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  sessionId: string;
  projectId: string;
  title: string;
  status: Thread["status"];
  summary: string | null;
}

interface TaskRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  sessionId: string;
  threadId: string;
  projectId: string;
  title: string;
  status: Task["status"];
  priority: Task["priority"];
  summary: string | null;
}

interface EventRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  projectId: string;
  sessionId: string | null;
  threadId: string | null;
  taskId: string | null;
  fileChangeId: string | null;
  guidanceItemId: string | null;
  actionItemId: string | null;
  memoryItemId: string | null;
  originType: Event["originType"];
  eventType: string;
  category: Event["category"];
  nodeCategory: Event["nodeCategory"];
  timestamp: string;
  summary: string;
  metadataJson: string;
}

interface FileChangeRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  eventId: string;
  projectId: string;
  sessionId: string | null;
  threadId: string | null;
  taskId: string | null;
  path: string;
  changeType: FileChange["changeType"];
  fromPath: string | null;
  summary: string | null;
  diffPreview: string | null;
  language: string | null;
  fileType: FileChange["fileType"];
  gitRef: string | null;
}

interface MemoryItemRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  projectId: string | null;
  sessionId: string | null;
  threadId: string | null;
  bucket: MemoryItem["bucket"];
  status: MemoryItem["status"];
  summary: string;
  content: string;
  confidence: string | number;
  freshness: string | number;
  isPinned: string | number | boolean;
  isEdited: string | number | boolean;
}

interface GuidanceItemRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  projectId: string;
  sessionId: string | null;
  threadId: string | null;
  title: string;
  summary: string;
  rationale: string;
  state: GuidanceItem["state"];
  source: GuidanceItem["source"];
  linkedMemoryItemIdsJson: string;
}

interface ActionItemRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  projectId: string;
  sessionId: string | null;
  threadId: string | null;
  title: string;
  summary: string | null;
  state: ActionItem["state"];
  riskLevel: ActionItem["riskLevel"];
  riskSummary: string;
  riskFactorsJson: string;
  expectedOutcome: string | null;
  actualOutcome: string | null;
  owner: ActionItem["owner"];
}

function parseObjectJson(value: string | null | undefined): Record<string, unknown> {
  if (!value) {
    return {};
  }

  const parsed = JSON.parse(value) as unknown;
  return typeof parsed === "object" && parsed && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function parseStringArrayJson(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function parseBooleanValue(value: string | number | boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  return value === "1" || value === "true";
}

function parseNumberValue(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

function mapProfileRow(row: ProfileRow): Profile {
  return {
    kind: "Profile",
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    displayName: row.displayName,
    ...(row.defaultProjectId ? { defaultProjectId: row.defaultProjectId } : {}),
    metadata: parseObjectJson(row.metadataJson)
  };
}

function mapProjectRow(row: ProjectRow): Project {
  return {
    kind: "Project",
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    profileId: row.profileId,
    name: row.name,
    ...(row.description ? { description: row.description } : {}),
    ...(row.summary ? { summary: row.summary } : {}),
    ...(row.workspacePath ? { workspacePath: row.workspacePath } : {}),
    ...(row.repositoryRemote ? { repositoryRemote: row.repositoryRemote } : {}),
    descriptors: parseStringArrayJson(row.descriptorsJson)
  };
}

function mapSessionRow(row: SessionRow): Session {
  return {
    kind: "Session",
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    profileId: row.profileId,
    projectId: row.projectId,
    status: row.status,
    ...(row.summary ? { summary: row.summary } : {}),
    startedAt: row.startedAt,
    ...(row.completedAt ? { completedAt: row.completedAt } : {})
  };
}

function mapThreadRow(row: ThreadRow): Thread {
  return {
    kind: "Thread",
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sessionId: row.sessionId,
    projectId: row.projectId,
    title: row.title,
    status: row.status,
    ...(row.summary ? { summary: row.summary } : {})
  };
}

function mapTaskRow(row: TaskRow): Task {
  return {
    kind: "Task",
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sessionId: row.sessionId,
    threadId: row.threadId,
    projectId: row.projectId,
    title: row.title,
    status: row.status,
    priority: row.priority,
    ...(row.summary ? { summary: row.summary } : {})
  };
}

function mapEventRow(row: EventRow): Event {
  return {
    kind: "Event",
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    projectId: row.projectId,
    ...(row.sessionId ? { sessionId: row.sessionId } : {}),
    ...(row.threadId ? { threadId: row.threadId } : {}),
    ...(row.taskId ? { taskId: row.taskId } : {}),
    ...(row.fileChangeId ? { fileChangeId: row.fileChangeId } : {}),
    ...(row.guidanceItemId ? { guidanceItemId: row.guidanceItemId } : {}),
    ...(row.actionItemId ? { actionItemId: row.actionItemId } : {}),
    ...(row.memoryItemId ? { memoryItemId: row.memoryItemId } : {}),
    originType: row.originType,
    eventType: row.eventType,
    category: row.category,
    nodeCategory: row.nodeCategory,
    timestamp: row.timestamp,
    summary: row.summary,
    metadata: parseObjectJson(row.metadataJson)
  };
}

function mapFileChangeRow(row: FileChangeRow): FileChange {
  return {
    kind: "FileChange",
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    eventId: row.eventId,
    projectId: row.projectId,
    ...(row.sessionId ? { sessionId: row.sessionId } : {}),
    ...(row.threadId ? { threadId: row.threadId } : {}),
    ...(row.taskId ? { taskId: row.taskId } : {}),
    path: row.path,
    changeType: row.changeType,
    ...(row.fromPath ? { fromPath: row.fromPath } : {}),
    ...(row.summary ? { summary: row.summary } : {}),
    ...(row.diffPreview ? { diffPreview: row.diffPreview } : {}),
    ...(row.language ? { language: row.language } : {}),
    fileType: row.fileType,
    ...(row.gitRef ? { gitRef: row.gitRef } : {})
  };
}

function mapMemoryItemRow(row: MemoryItemRow): MemoryItem {
  return {
    kind: "MemoryItem",
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.projectId ? { projectId: row.projectId } : {}),
    ...(row.sessionId ? { sessionId: row.sessionId } : {}),
    ...(row.threadId ? { threadId: row.threadId } : {}),
    bucket: row.bucket,
    status: row.status,
    summary: row.summary,
    content: row.content,
    confidence: parseNumberValue(row.confidence),
    freshness: parseNumberValue(row.freshness),
    isPinned: parseBooleanValue(row.isPinned),
    isEdited: parseBooleanValue(row.isEdited)
  };
}

function mapGuidanceItemRow(row: GuidanceItemRow): GuidanceItem {
  return {
    kind: "GuidanceItem",
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    projectId: row.projectId,
    ...(row.sessionId ? { sessionId: row.sessionId } : {}),
    ...(row.threadId ? { threadId: row.threadId } : {}),
    title: row.title,
    summary: row.summary,
    rationale: row.rationale,
    state: row.state,
    source: row.source,
    linkedMemoryItemIds: parseStringArrayJson(row.linkedMemoryItemIdsJson)
  };
}

function mapActionItemRow(row: ActionItemRow): ActionItem {
  return {
    kind: "ActionItem",
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    projectId: row.projectId,
    ...(row.sessionId ? { sessionId: row.sessionId } : {}),
    ...(row.threadId ? { threadId: row.threadId } : {}),
    title: row.title,
    ...(row.summary ? { summary: row.summary } : {}),
    state: row.state,
    riskLevel: row.riskLevel,
    riskSummary: row.riskSummary,
    riskFactors: parseStringArrayJson(row.riskFactorsJson),
    ...(row.expectedOutcome ? { expectedOutcome: row.expectedOutcome } : {}),
    ...(row.actualOutcome ? { actualOutcome: row.actualOutcome } : {}),
    owner: row.owner
  };
}

function stringifyBoolean(value: boolean): string {
  return value ? "1" : "0";
}

function createActionTransitionEventRecord(
  actionRow: ActionItemRow,
  input: ActionStateTransitionInput,
  timestamp: string,
  actor: ActionItem["owner"]
) {
  return {
    id: `event-action-${actionRow.id}-${timestamp.replaceAll(/[^0-9]/g, "")}`,
    projectId: actionRow.projectId,
    sessionId: actionRow.sessionId,
    threadId: actionRow.threadId,
    actionItemId: actionRow.id,
    originType: "submind" as const,
    eventType: "action-state-transition",
    category: "action" as const,
    nodeCategory: "control" as const,
    timestamp,
    summary: `${actionRow.title} moved from ${actionRow.state} to ${input.nextState}.`,
    metadataJson: JSON.stringify({
      actionId: actionRow.id,
      actor,
      previousState: actionRow.state,
      nextState: input.nextState
    })
  };
}

function buildEventHistoryQuery(input: EventHistoryQueryInput = {}): {
  query: string;
  bindValues: unknown[];
} {
  const conditions: string[] = [];
  const bindValues: unknown[] = [];

  function addCondition(column: string, value: unknown) {
    bindValues.push(value);
    conditions.push(`${column} = $${bindValues.length}`);
  }

  addConditionIfPresent("project_id", input.projectId);
  addConditionIfPresent("session_id", input.sessionId);
  addConditionIfPresent("thread_id", input.threadId);
  addConditionIfPresent("task_id", input.taskId);
  addConditionIfPresent("action_item_id", input.actionItemId);
  addConditionIfPresent("guidance_item_id", input.guidanceItemId);
  addConditionIfPresent("memory_item_id", input.memoryItemId);

  if (input.categories && input.categories.length > 0) {
    const placeholders = input.categories.map((category) => {
      bindValues.push(category);
      return `$${bindValues.length}`;
    });
    conditions.push(`category IN (${placeholders.join(", ")})`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitClause =
    input.limit && input.limit > 0 ? `LIMIT ${Math.trunc(input.limit)}` : "";

  return {
    query: `SELECT
       id,
       created_at AS createdAt,
       updated_at AS updatedAt,
       project_id AS projectId,
       session_id AS sessionId,
       thread_id AS threadId,
       task_id AS taskId,
       file_change_id AS fileChangeId,
       guidance_item_id AS guidanceItemId,
       action_item_id AS actionItemId,
       memory_item_id AS memoryItemId,
       origin_type AS originType,
       event_type AS eventType,
       category,
       node_category AS nodeCategory,
       timestamp,
       summary,
       metadata_json AS metadataJson
     FROM events
     ${whereClause}
     ORDER BY timestamp DESC, created_at DESC
     ${limitClause}`.trim(),
    bindValues
  };

  function addConditionIfPresent(column: string, value: string | undefined) {
    if (value) {
      addCondition(column, value);
    }
  }
}

function buildFileChangeHistoryQuery(input: FileChangeHistoryQueryInput = {}): {
  query: string;
  bindValues: unknown[];
} {
  const conditions: string[] = [];
  const bindValues: unknown[] = [];

  function addCondition(column: string, value: string | undefined) {
    if (!value) {
      return;
    }

    bindValues.push(value);
    conditions.push(`${column} = $${bindValues.length}`);
  }

  addCondition("project_id", input.projectId);
  addCondition("session_id", input.sessionId);
  addCondition("thread_id", input.threadId);
  addCondition("task_id", input.taskId);
  addCondition("event_id", input.eventId);

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitClause =
    input.limit && input.limit > 0 ? `LIMIT ${Math.trunc(input.limit)}` : "";

  return {
    query: `SELECT
       id,
       created_at AS createdAt,
       updated_at AS updatedAt,
       event_id AS eventId,
       project_id AS projectId,
       session_id AS sessionId,
       thread_id AS threadId,
       task_id AS taskId,
       path,
       change_type AS changeType,
       from_path AS fromPath,
       summary,
       diff_preview AS diffPreview,
       language,
       file_type AS fileType,
       git_ref AS gitRef
     FROM file_changes
     ${whereClause}
     ORDER BY updated_at DESC, created_at DESC
     ${limitClause}`.trim(),
    bindValues
  };
}

async function ensureSchema(db: SubMindSqlDatabase): Promise<void> {
  for (const statement of createTableStatements) {
    await db.execute(statement);
  }
}

async function hasSeedData(db: SubMindSqlDatabase): Promise<boolean> {
  const rows = await db.select<Array<{ count: number | string }>>(
    "SELECT COUNT(*) AS count FROM profiles"
  );
  const count = rows[0]?.count ?? 0;
  return Number(count) > 0;
}

async function seedSnapshotIntoDatabase(
  db: SubMindSqlDatabase,
  snapshot: SubMindStoreSnapshot
): Promise<void> {
  await seedCoreSnapshotIntoDatabase(db, snapshot);
  await seedRetainedSnapshotIntoDatabase(db, snapshot);
}

async function seedCoreSnapshotIntoDatabase(
  db: SubMindSqlDatabase,
  snapshot: SubMindStoreSnapshot
): Promise<void> {
  for (const profile of snapshot.profiles) {
    await db.execute(
      `INSERT OR IGNORE INTO profiles
       (id, created_at, updated_at, display_name, default_project_id, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        profile.id,
        profile.createdAt,
        profile.updatedAt,
        profile.displayName,
        profile.defaultProjectId ?? null,
        JSON.stringify(profile.metadata)
      ]
    );
  }

  for (const project of snapshot.projects) {
    await db.execute(
      `INSERT OR IGNORE INTO projects
       (id, created_at, updated_at, profile_id, name, description, summary, workspace_path, repository_remote, descriptors_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        project.id,
        project.createdAt,
        project.updatedAt,
        project.profileId,
        project.name,
        project.description ?? null,
        project.summary ?? null,
        project.workspacePath ?? null,
        project.repositoryRemote ?? null,
        JSON.stringify(project.descriptors)
      ]
    );
  }

  for (const session of snapshot.sessions) {
    await db.execute(
      `INSERT OR IGNORE INTO sessions
       (id, created_at, updated_at, profile_id, project_id, status, summary, started_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        session.id,
        session.createdAt,
        session.updatedAt,
        session.profileId,
        session.projectId,
        session.status,
        session.summary ?? null,
        session.startedAt,
        session.completedAt ?? null
      ]
    );
  }

  for (const thread of snapshot.threads) {
    await db.execute(
      `INSERT OR IGNORE INTO threads
       (id, created_at, updated_at, session_id, project_id, title, status, summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        thread.id,
        thread.createdAt,
        thread.updatedAt,
        thread.sessionId,
        thread.projectId,
        thread.title,
        thread.status,
        thread.summary ?? null
      ]
    );
  }

  for (const task of snapshot.tasks) {
    await db.execute(
      `INSERT OR IGNORE INTO tasks
       (id, created_at, updated_at, session_id, thread_id, project_id, title, status, priority, summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        task.id,
        task.createdAt,
        task.updatedAt,
        task.sessionId,
        task.threadId,
        task.projectId,
        task.title,
        task.status,
        task.priority,
        task.summary ?? null
      ]
    );
  }

  for (const event of snapshot.events) {
    await db.execute(
      `INSERT OR IGNORE INTO events
       (id, created_at, updated_at, project_id, session_id, thread_id, task_id, file_change_id, guidance_item_id, action_item_id, memory_item_id, origin_type, event_type, category, node_category, timestamp, summary, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        event.id,
        event.createdAt,
        event.updatedAt,
        event.projectId,
        event.sessionId ?? null,
        event.threadId ?? null,
        event.taskId ?? null,
        event.fileChangeId ?? null,
        event.guidanceItemId ?? null,
        event.actionItemId ?? null,
        event.memoryItemId ?? null,
        event.originType,
        event.eventType,
        event.category,
        event.nodeCategory,
        event.timestamp,
        event.summary,
        JSON.stringify(event.metadata)
      ]
    );
  }

  for (const fileChange of snapshot.fileChanges) {
    await db.execute(
      `INSERT OR IGNORE INTO file_changes
       (id, created_at, updated_at, event_id, project_id, session_id, thread_id, task_id, path, change_type, from_path, summary, diff_preview, language, file_type, git_ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        fileChange.id,
        fileChange.createdAt,
        fileChange.updatedAt,
        fileChange.eventId,
        fileChange.projectId,
        fileChange.sessionId ?? null,
        fileChange.threadId ?? null,
        fileChange.taskId ?? null,
        fileChange.path,
        fileChange.changeType,
        fileChange.fromPath ?? null,
        fileChange.summary ?? null,
        fileChange.diffPreview ?? null,
        fileChange.language ?? null,
        fileChange.fileType,
        fileChange.gitRef ?? null
      ]
    );
  }
}

async function seedRetainedSnapshotIntoDatabase(
  db: SubMindSqlDatabase,
  snapshot: SubMindStoreSnapshot
): Promise<void> {
  for (const memoryItem of snapshot.memory) {
    await db.execute(
      `INSERT OR IGNORE INTO memory_items
       (id, created_at, updated_at, project_id, session_id, thread_id, bucket, status, summary, content, confidence, freshness, is_pinned, is_edited)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        memoryItem.id,
        memoryItem.createdAt,
        memoryItem.updatedAt,
        memoryItem.projectId ?? null,
        memoryItem.sessionId ?? null,
        memoryItem.threadId ?? null,
        memoryItem.bucket,
        memoryItem.status,
        memoryItem.summary,
        memoryItem.content,
        String(memoryItem.confidence),
        String(memoryItem.freshness),
        stringifyBoolean(memoryItem.isPinned),
        stringifyBoolean(memoryItem.isEdited)
      ]
    );
  }

  for (const guidanceItem of snapshot.guidance) {
    await db.execute(
      `INSERT OR IGNORE INTO guidance_items
       (id, created_at, updated_at, project_id, session_id, thread_id, title, summary, rationale, state, source, linked_memory_item_ids_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        guidanceItem.id,
        guidanceItem.createdAt,
        guidanceItem.updatedAt,
        guidanceItem.projectId,
        guidanceItem.sessionId ?? null,
        guidanceItem.threadId ?? null,
        guidanceItem.title,
        guidanceItem.summary,
        guidanceItem.rationale,
        guidanceItem.state,
        guidanceItem.source,
        JSON.stringify(guidanceItem.linkedMemoryItemIds)
      ]
    );
  }

  for (const actionItem of snapshot.actions) {
    await db.execute(
      `INSERT OR IGNORE INTO action_items
       (id, created_at, updated_at, project_id, session_id, thread_id, title, summary, state, risk_level, risk_summary, risk_factors_json, expected_outcome, actual_outcome, owner)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        actionItem.id,
        actionItem.createdAt,
        actionItem.updatedAt,
        actionItem.projectId,
        actionItem.sessionId ?? null,
        actionItem.threadId ?? null,
        actionItem.title,
        actionItem.summary ?? null,
        actionItem.state,
        actionItem.riskLevel,
        actionItem.riskSummary,
        JSON.stringify(actionItem.riskFactors),
        actionItem.expectedOutcome ?? null,
        actionItem.actualOutcome ?? null,
        actionItem.owner
      ]
    );
  }
}

async function executeStatements(
  db: SubMindSqlDatabase,
  statements: readonly string[]
): Promise<void> {
  for (const statement of statements) {
    await db.execute(statement);
  }
}

async function getAppStateValue(
  db: SubMindSqlDatabase,
  key: string
): Promise<string | null> {
  const rows = await db.select<Array<{ value: string }>>(
    `SELECT value FROM app_state WHERE key = $1`,
    [key]
  );

  return rows[0]?.value ?? null;
}

async function setAppStateValue(
  db: SubMindSqlDatabase,
  key: string,
  value: string
): Promise<void> {
  await db.execute(
    `INSERT INTO app_state (key, value)
     VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

export async function syncRuntimeSnapshotIntoDatabase(
  db: SubMindSqlDatabase,
  snapshot: SubMindStoreSnapshot
): Promise<void> {
  await ensureSchema(db);

  const currentRuntimeSource = await getAppStateValue(db, runtimeSourceKey);

  if (currentRuntimeSource === runtimeSourceValue) {
    await executeStatements(db, clearCoreDataStatements);
    await seedCoreSnapshotIntoDatabase(db, snapshot);
  } else {
    await executeStatements(db, clearAllDataStatements);
    await seedSnapshotIntoDatabase(db, snapshot);
  }

  await setAppStateValue(db, runtimeSourceKey, runtimeSourceValue);
}

async function readSnapshot(db: SubMindSqlDatabase): Promise<SubMindStoreSnapshot> {
  const [
    profileRows,
    projectRows,
    sessionRows,
    threadRows,
    taskRows,
    eventRows,
    fileChangeRows,
    memoryRows,
    guidanceRows,
    actionRows
  ] = await Promise.all([
    db.select<ProfileRow[]>(
      `SELECT
         id,
         created_at AS createdAt,
         updated_at AS updatedAt,
         display_name AS displayName,
         default_project_id AS defaultProjectId,
         metadata_json AS metadataJson
       FROM profiles
       ORDER BY updated_at DESC, created_at DESC`
    ),
    db.select<ProjectRow[]>(
      `SELECT
         id,
         created_at AS createdAt,
         updated_at AS updatedAt,
         profile_id AS profileId,
         name,
         description,
         summary,
         workspace_path AS workspacePath,
         repository_remote AS repositoryRemote,
         descriptors_json AS descriptorsJson
       FROM projects
       ORDER BY updated_at DESC, created_at DESC`
    ),
    db.select<SessionRow[]>(
      `SELECT
         id,
         created_at AS createdAt,
         updated_at AS updatedAt,
         profile_id AS profileId,
         project_id AS projectId,
         status,
         summary,
         started_at AS startedAt,
         completed_at AS completedAt
       FROM sessions
       ORDER BY updated_at DESC, started_at DESC`
    ),
    db.select<ThreadRow[]>(
      `SELECT
         id,
         created_at AS createdAt,
         updated_at AS updatedAt,
         session_id AS sessionId,
         project_id AS projectId,
         title,
         status,
         summary
       FROM threads
       ORDER BY updated_at DESC, created_at DESC`
    ),
    db.select<TaskRow[]>(
      `SELECT
         id,
         created_at AS createdAt,
         updated_at AS updatedAt,
         session_id AS sessionId,
         thread_id AS threadId,
         project_id AS projectId,
         title,
         status,
         priority,
         summary
       FROM tasks
       ORDER BY updated_at DESC, created_at DESC`
    ),
    db.select<EventRow[]>(
      `SELECT
         id,
         created_at AS createdAt,
         updated_at AS updatedAt,
         project_id AS projectId,
         session_id AS sessionId,
         thread_id AS threadId,
         task_id AS taskId,
         file_change_id AS fileChangeId,
         guidance_item_id AS guidanceItemId,
         action_item_id AS actionItemId,
         memory_item_id AS memoryItemId,
         origin_type AS originType,
         event_type AS eventType,
         category,
         node_category AS nodeCategory,
         timestamp,
         summary,
         metadata_json AS metadataJson
       FROM events
       ORDER BY timestamp DESC, created_at DESC`
    ),
    db.select<FileChangeRow[]>(
      `SELECT
         id,
         created_at AS createdAt,
         updated_at AS updatedAt,
         event_id AS eventId,
         project_id AS projectId,
         session_id AS sessionId,
         thread_id AS threadId,
         task_id AS taskId,
         path,
         change_type AS changeType,
         from_path AS fromPath,
         summary,
         diff_preview AS diffPreview,
         language,
         file_type AS fileType,
         git_ref AS gitRef
       FROM file_changes
       ORDER BY updated_at DESC, created_at DESC`
    ),
    db.select<MemoryItemRow[]>(
      `SELECT
         id,
         created_at AS createdAt,
         updated_at AS updatedAt,
         project_id AS projectId,
         session_id AS sessionId,
         thread_id AS threadId,
         bucket,
         status,
         summary,
         content,
         confidence,
         freshness,
         is_pinned AS isPinned,
         is_edited AS isEdited
       FROM memory_items
       ORDER BY
         CASE WHEN is_pinned IN ('1', 'true') THEN 1 ELSE 0 END DESC,
         updated_at DESC,
         confidence DESC`
    ),
    db.select<GuidanceItemRow[]>(
      `SELECT
         id,
         created_at AS createdAt,
         updated_at AS updatedAt,
         project_id AS projectId,
         session_id AS sessionId,
         thread_id AS threadId,
         title,
         summary,
         rationale,
         state,
         source,
         linked_memory_item_ids_json AS linkedMemoryItemIdsJson
       FROM guidance_items
       ORDER BY
         CASE state
           WHEN 'injected' THEN 0
           WHEN 'candidate' THEN 1
           WHEN 'suggested' THEN 2
           WHEN 'suppressed' THEN 3
           ELSE 4
         END,
         updated_at DESC,
         created_at DESC`
    ),
    db.select<ActionItemRow[]>(
      `SELECT
         id,
         created_at AS createdAt,
         updated_at AS updatedAt,
         project_id AS projectId,
         session_id AS sessionId,
         thread_id AS threadId,
         title,
         summary,
         state,
         risk_level AS riskLevel,
         risk_summary AS riskSummary,
         risk_factors_json AS riskFactorsJson,
         expected_outcome AS expectedOutcome,
         actual_outcome AS actualOutcome,
         owner
       FROM action_items
       ORDER BY
         CASE state
           WHEN 'pending' THEN 0
           WHEN 'in_progress' THEN 1
           WHEN 'blocked' THEN 2
           WHEN 'approved' THEN 3
           WHEN 'rejected' THEN 4
           ELSE 5
         END,
         CASE risk_level
           WHEN 'critical' THEN 0
           WHEN 'high' THEN 1
           WHEN 'medium' THEN 2
           ELSE 3
         END,
         updated_at DESC,
         created_at DESC`
    )
  ]);

  return {
    profiles: profileRows.map(mapProfileRow),
    projects: projectRows.map(mapProjectRow),
    sessions: sessionRows.map(mapSessionRow),
    threads: threadRows.map(mapThreadRow),
    tasks: taskRows.map(mapTaskRow),
    events: eventRows.map(mapEventRow),
    fileChanges: fileChangeRows.map(mapFileChangeRow),
    memory: memoryRows.map(mapMemoryItemRow),
    guidance: guidanceRows.map(mapGuidanceItemRow),
    actions: actionRows.map(mapActionItemRow)
  };
}

async function readEventHistory(
  db: SubMindSqlDatabase,
  input: EventHistoryQueryInput = {}
): Promise<Event[]> {
  const { query, bindValues } = buildEventHistoryQuery(input);
  const rows = await db.select<EventRow[]>(query, bindValues);
  return rows.map(mapEventRow);
}

async function readFileChangeHistory(
  db: SubMindSqlDatabase,
  input: FileChangeHistoryQueryInput = {}
): Promise<FileChange[]> {
  const { query, bindValues } = buildFileChangeHistoryQuery(input);
  const rows = await db.select<FileChangeRow[]>(query, bindValues);
  return rows.map(mapFileChangeRow);
}

async function selectActionRow(
  db: SubMindSqlDatabase,
  actionId: string
): Promise<ActionItemRow | null> {
  const rows = await db.select<ActionItemRow[]>(
    `SELECT
       id,
       created_at AS createdAt,
       updated_at AS updatedAt,
       project_id AS projectId,
       session_id AS sessionId,
       thread_id AS threadId,
       title,
       summary,
       state,
       risk_level AS riskLevel,
       risk_summary AS riskSummary,
       risk_factors_json AS riskFactorsJson,
       expected_outcome AS expectedOutcome,
       actual_outcome AS actualOutcome,
       owner
     FROM action_items
     WHERE id = $1`,
    [actionId]
  );

  return rows[0] ?? null;
}

export function createSqliteRepository(
  options: CreateSqliteRepositoryOptions
): SubMindRepository {
  const { db, seedSnapshot, now = () => new Date().toISOString() } = options;
  let initializationPromise: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    if (!initializationPromise) {
      initializationPromise = (async () => {
        await ensureSchema(db);

        if (seedSnapshot && !(await hasSeedData(db))) {
          await seedSnapshotIntoDatabase(db, seedSnapshot);
        }
      })();
    }

    return initializationPromise;
  }

  return {
    async getSnapshot() {
      await ensureInitialized();
      return readSnapshot(db);
    },
    async getEventHistory(input = {}) {
      await ensureInitialized();
      return readEventHistory(db, input);
    },
    async getFileChangeHistory(input = {}) {
      await ensureInitialized();
      return readFileChangeHistory(db, input);
    },
    async getActionHistory(actionId, limit) {
      await ensureInitialized();
      return readEventHistory(
        db,
        limit === undefined
          ? { actionItemId: actionId }
          : { actionItemId: actionId, limit }
      );
    },
    async transitionAction(input) {
      await ensureInitialized();

      const existingAction = await selectActionRow(db, input.actionId);

      if (!existingAction) {
        throw new Error(`Action item "${input.actionId}" was not found.`);
      }

      const timestamp = input.timestamp ?? now();
      const actor = input.actor ?? "operator";
      const nextActualOutcome =
        input.actualOutcome ?? existingAction.actualOutcome;

      await db.execute(
        `UPDATE action_items
         SET state = $1,
             actual_outcome = $2,
             updated_at = $3
         WHERE id = $4`,
        [input.nextState, nextActualOutcome ?? null, timestamp, input.actionId]
      );

      const eventRecord = createActionTransitionEventRecord(
        existingAction,
        input,
        timestamp,
        actor
      );

      await db.execute(
        `INSERT INTO events
         (id, created_at, updated_at, project_id, session_id, thread_id, task_id, file_change_id, guidance_item_id, action_item_id, memory_item_id, origin_type, event_type, category, node_category, timestamp, summary, metadata_json)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, NULL, $7, NULL, $8, $9, $10, $11, $12, $13, $14)`,
        [
          eventRecord.id,
          timestamp,
          timestamp,
          eventRecord.projectId,
          eventRecord.sessionId,
          eventRecord.threadId,
          eventRecord.actionItemId,
          eventRecord.originType,
          eventRecord.eventType,
          eventRecord.category,
          eventRecord.nodeCategory,
          eventRecord.timestamp,
          eventRecord.summary,
          eventRecord.metadataJson
        ]
      );

      return mapActionItemRow({
        ...existingAction,
        state: input.nextState,
        actualOutcome: nextActualOutcome ?? null,
        updatedAt: timestamp
      });
    }
  };
}
