import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const appStateTable = sqliteTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull()
});

export const profilesTable = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  displayName: text("display_name").notNull(),
  defaultProjectId: text("default_project_id"),
  metadataJson: text("metadata_json").notNull()
});

export const projectsTable = sqliteTable("projects", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  profileId: text("profile_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  summary: text("summary"),
  workspacePath: text("workspace_path"),
  repositoryRemote: text("repository_remote"),
  descriptorsJson: text("descriptors_json").notNull()
});

export const sessionsTable = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  profileId: text("profile_id").notNull(),
  projectId: text("project_id").notNull(),
  status: text("status").notNull(),
  summary: text("summary"),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at")
});

export const threadsTable = sqliteTable("threads", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  sessionId: text("session_id").notNull(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  summary: text("summary")
});

export const tasksTable = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  sessionId: text("session_id").notNull(),
  threadId: text("thread_id").notNull(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  priority: text("priority").notNull(),
  summary: text("summary")
});

export const eventsTable = sqliteTable("events", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  projectId: text("project_id").notNull(),
  sessionId: text("session_id"),
  threadId: text("thread_id"),
  taskId: text("task_id"),
  fileChangeId: text("file_change_id"),
  guidanceItemId: text("guidance_item_id"),
  actionItemId: text("action_item_id"),
  memoryItemId: text("memory_item_id"),
  originType: text("origin_type").notNull(),
  eventType: text("event_type").notNull(),
  category: text("category").notNull(),
  nodeCategory: text("node_category").notNull(),
  timestamp: text("timestamp").notNull(),
  summary: text("summary").notNull(),
  metadataJson: text("metadata_json").notNull()
});

export const fileChangesTable = sqliteTable("file_changes", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  eventId: text("event_id").notNull(),
  projectId: text("project_id").notNull(),
  sessionId: text("session_id"),
  threadId: text("thread_id"),
  taskId: text("task_id"),
  path: text("path").notNull(),
  changeType: text("change_type").notNull(),
  fromPath: text("from_path"),
  summary: text("summary"),
  diffPreview: text("diff_preview"),
  language: text("language"),
  fileType: text("file_type").notNull(),
  gitRef: text("git_ref")
});

export const memoryItemsTable = sqliteTable("memory_items", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  projectId: text("project_id"),
  sessionId: text("session_id"),
  threadId: text("thread_id"),
  bucket: text("bucket").notNull(),
  status: text("status").notNull(),
  summary: text("summary").notNull(),
  content: text("content").notNull(),
  confidence: text("confidence").notNull(),
  freshness: text("freshness").notNull(),
  curationState: text("curation_state").notNull(),
  sourceEventIdsJson: text("source_event_ids_json").notNull(),
  sourceFileChangeIdsJson: text("source_file_change_ids_json").notNull(),
  linkedActionItemIdsJson: text("linked_action_item_ids_json").notNull(),
  linkedGuidanceItemIdsJson: text("linked_guidance_item_ids_json").notNull(),
  changeSummary: text("change_summary"),
  isPinned: text("is_pinned").notNull(),
  isEdited: text("is_edited").notNull()
});

export const guidanceItemsTable = sqliteTable("guidance_items", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  projectId: text("project_id").notNull(),
  sessionId: text("session_id"),
  threadId: text("thread_id"),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  rationale: text("rationale").notNull(),
  state: text("state").notNull(),
  source: text("source").notNull(),
  confidence: text("confidence").notNull(),
  evidenceSummary: text("evidence_summary").notNull(),
  policySummary: text("policy_summary").notNull(),
  linkedMemoryItemIdsJson: text("linked_memory_item_ids_json").notNull(),
  linkedEventIdsJson: text("linked_event_ids_json").notNull(),
  linkedActionItemIdsJson: text("linked_action_item_ids_json").notNull()
});

export const actionItemsTable = sqliteTable("action_items", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  projectId: text("project_id").notNull(),
  sessionId: text("session_id"),
  threadId: text("thread_id"),
  title: text("title").notNull(),
  summary: text("summary"),
  state: text("state").notNull(),
  riskLevel: text("risk_level").notNull(),
  riskSummary: text("risk_summary").notNull(),
  riskFactorsJson: text("risk_factors_json").notNull(),
  expectedOutcome: text("expected_outcome"),
  actualOutcome: text("actual_outcome"),
  owner: text("owner").notNull()
});

export const subMindSqliteSchema = {
  appStateTable,
  profilesTable,
  projectsTable,
  sessionsTable,
  threadsTable,
  tasksTable,
  eventsTable,
  fileChangesTable,
  memoryItemsTable,
  guidanceItemsTable,
  actionItemsTable
} as const;
