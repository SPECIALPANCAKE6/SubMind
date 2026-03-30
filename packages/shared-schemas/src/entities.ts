import type { EventTaxonomy } from "./events.js";
import type { ProjectStackState } from "./project-stack.js";

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
  state: ProjectStackState;
}

export interface Session extends BaseEntity {
  kind: "Session";
  profileId: string;
  projectId: string;
  status: "active" | "idle" | "completed";
  startedAt: ISODateString;
  completedAt?: ISODateString;
}

export interface Thread extends BaseEntity {
  kind: "Thread";
  sessionId: string;
  projectId: string;
  title: string;
  status: "open" | "idle" | "closed";
}

export interface Task extends BaseEntity {
  kind: "Task";
  sessionId: string;
  threadId: string;
  projectId: string;
  title: string;
  status: "queued" | "active" | "blocked" | "completed";
  priority: "low" | "medium" | "high";
}

export interface Event extends BaseEntity {
  kind: "Event";
  sessionId: string;
  threadId: string;
  projectId: string;
  taxonomy: EventTaxonomy;
  source: "codex" | "system" | "user" | "worker" | "subagent";
  occurredAt: ISODateString;
  payload: Record<string, unknown>;
}

export interface FileChange extends BaseEntity {
  kind: "FileChange";
  eventId: string;
  sessionId: string;
  threadId: string;
  projectId: string;
  path: string;
  changeType: "added" | "updated" | "deleted" | "renamed";
  fromPath?: string;
  summary?: string;
}

export interface MemoryItem extends BaseEntity {
  kind: "MemoryItem";
  projectId: string;
  sessionId?: string;
  threadId?: string;
  category: "fact" | "decision" | "constraint" | "summary";
  content: string;
  importance: number;
}

export interface GuidanceItem extends BaseEntity {
  kind: "GuidanceItem";
  projectId: string;
  sessionId?: string;
  threadId?: string;
  title: string;
  content: string;
  status: "active" | "resolved" | "archived";
  source: "operator" | "policy" | "system";
}

export interface ActionItem extends BaseEntity {
  kind: "ActionItem";
  projectId: string;
  sessionId?: string;
  threadId?: string;
  title: string;
  description?: string;
  status: "open" | "in_progress" | "blocked" | "done";
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
