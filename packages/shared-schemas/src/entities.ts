import type {
  EventNodeCategory,
  EventOrigin,
  EventTaxonomy
} from "./events.js";

export const coreEntityKinds = [
  "Profile",
  "Project",
  "Session",
  "Thread",
  "Task",
  "Event",
  "FileChange",
  "MemoryItem",
  "GuidanceItem",
  "ActionItem"
] as const;

export type CoreEntityKind = (typeof coreEntityKinds)[number];

export type ISODateString = string;

export interface BaseEntity {
  id: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Profile extends BaseEntity {
  kind: "Profile";
  displayName: string;
  defaultProjectId?: string;
  metadata: Record<string, unknown>;
}

export interface Project extends BaseEntity {
  kind: "Project";
  profileId: string;
  name: string;
  description?: string;
  summary?: string;
  workspacePath?: string;
  repositoryRemote?: string;
  descriptors: string[];
}

export interface Session extends BaseEntity {
  kind: "Session";
  profileId: string;
  projectId: string;
  status: "active" | "idle" | "completed";
  summary?: string;
  startedAt: ISODateString;
  completedAt?: ISODateString;
}

export interface Thread extends BaseEntity {
  kind: "Thread";
  sessionId: string;
  projectId: string;
  title: string;
  status: "open" | "idle" | "closed";
  summary?: string;
}

export interface Task extends BaseEntity {
  kind: "Task";
  sessionId: string;
  threadId: string;
  projectId: string;
  title: string;
  status: "queued" | "active" | "blocked" | "completed";
  priority: "low" | "medium" | "high";
  summary?: string;
}

export interface Event extends BaseEntity {
  kind: "Event";
  projectId: string;
  sessionId?: string;
  threadId?: string;
  taskId?: string;
  fileChangeId?: string;
  guidanceItemId?: string;
  actionItemId?: string;
  memoryItemId?: string;
  originType: EventOrigin;
  eventType: string;
  category: EventTaxonomy;
  nodeCategory: EventNodeCategory;
  timestamp: ISODateString;
  summary: string;
  metadata: Record<string, unknown>;
}

export interface FileChange extends BaseEntity {
  kind: "FileChange";
  eventId: string;
  projectId: string;
  sessionId?: string;
  threadId?: string;
  taskId?: string;
  path: string;
  changeType: "added" | "updated" | "deleted" | "renamed";
  fromPath?: string;
  summary?: string;
  diffPreview?: string;
  language?: string;
  fileType: "source" | "config" | "asset" | "doc" | "other";
  gitRef?: string;
}

export interface MemoryItem extends BaseEntity {
  kind: "MemoryItem";
  projectId?: string;
  sessionId?: string;
  threadId?: string;
  bucket:
    | "project_context"
    | "architecture_notes"
    | "preferences"
    | "pending_items"
    | "gotchas"
    | "workflow_patterns";
  status: "active" | "archived" | "stale" | "superseded" | "draft";
  summary: string;
  content: string;
  confidence: number;
  freshness: number;
  curationState: "derived" | "confirmed" | "edited";
  sourceEventIds: string[];
  sourceFileChangeIds: string[];
  linkedActionItemIds: string[];
  linkedGuidanceItemIds: string[];
  changeSummary?: string;
  isPinned: boolean;
  isEdited: boolean;
}

export interface GuidanceItem extends BaseEntity {
  kind: "GuidanceItem";
  projectId: string;
  sessionId?: string;
  threadId?: string;
  title: string;
  summary: string;
  rationale: string;
  state: "candidate" | "injected" | "suggested" | "suppressed" | "resolved";
  source: "operator" | "policy" | "system" | "model";
  confidence: number;
  evidenceSummary: string;
  policySummary: string;
  linkedMemoryItemIds: string[];
  linkedEventIds: string[];
  linkedActionItemIds: string[];
}

export interface ActionItem extends BaseEntity {
  kind: "ActionItem";
  projectId: string;
  sessionId?: string;
  threadId?: string;
  title: string;
  summary?: string;
  state:
    | "pending"
    | "in_progress"
    | "approved"
    | "rejected"
    | "blocked"
    | "resolved";
  riskLevel: "low" | "medium" | "high" | "critical";
  riskSummary: string;
  riskFactors: string[];
  expectedOutcome?: string;
  actualOutcome?: string;
  owner: "operator" | "system" | "model";
}

export type SubMindEntity =
  | Profile
  | Project
  | Session
  | Thread
  | Task
  | Event
  | FileChange
  | MemoryItem
  | GuidanceItem
  | ActionItem;
