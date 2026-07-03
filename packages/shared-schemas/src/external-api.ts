import type {
  ActionItem,
  Event,
  FileChange,
  GuidanceItem,
  ISODateString,
  MemoryItem,
  Project,
  Session,
  Task,
  Thread
} from "./entities.js";

export const subMindExternalApiVersion = "v1" as const;

export const externalApiAccessModes = ["read_only"] as const;
export const externalApiAuthSchemes = ["bearer_token"] as const;

export type ExternalApiAccessMode = (typeof externalApiAccessModes)[number];
export type ExternalApiAuthScheme = (typeof externalApiAuthSchemes)[number];

export interface ProjectCollectionCounts {
  sessions: number;
  threads: number;
  tasks: number;
  events: number;
  fileChanges: number;
  memory: number;
  guidance: number;
  actions: number;
}

export interface ExternalProjectSummary {
  kind: "ExternalProjectSummary";
  project: Project;
  counts: ProjectCollectionCounts;
  lastActivityAt: ISODateString | null;
}

export interface ExternalProjectExport {
  kind: "ExternalProjectExport";
  apiVersion: typeof subMindExternalApiVersion;
  generatedAt: ISODateString;
  access: {
    mode: ExternalApiAccessMode;
    auth: ExternalApiAuthScheme;
    localOnly: true;
  };
  project: Project;
  counts: ProjectCollectionCounts;
  sessions: Session[];
  threads: Thread[];
  tasks: Task[];
  events: Event[];
  fileChanges: FileChange[];
  memory: MemoryItem[];
  guidance: GuidanceItem[];
  actions: ActionItem[];
}

export const contextDatumKinds = [
  "project_context",
  "memory",
  "guidance",
  "recent_change",
  "pending_action"
] as const;

export const contextSourceEntityKinds = [
  "Project",
  "MemoryItem",
  "GuidanceItem",
  "Event",
  "FileChange",
  "ActionItem"
] as const;

export type ContextDatumKind = (typeof contextDatumKinds)[number];
export type ContextSourceEntityKind =
  (typeof contextSourceEntityKinds)[number];
export type ContextRankingMode = "model" | "deterministic_fallback";

export interface ContextRequest {
  projectId?: string;
  projectQuery?: string;
  threadId?: string;
  prompt: string;
  maxItems?: number;
  maxTokens?: number;
  kinds?: ContextDatumKind[];
}

export interface ContextSourceReference {
  entityType: ContextSourceEntityKind;
  entityId: string;
  label: string;
}

export interface ContextDatum {
  id: string;
  kind: ContextDatumKind;
  projectId: string;
  threadId?: string;
  title: string;
  content: string;
  confidence: number;
  freshness: number;
  sensitivity: "normal" | "protected_redacted";
  deterministicScore: number;
  relevanceScore: number;
  relevanceRationale: string;
  estimatedTokens: number;
  sources: ContextSourceReference[];
}

export interface ContextBundle {
  kind: "ContextBundle";
  apiVersion: typeof subMindExternalApiVersion;
  bundleId: string;
  generatedAt: ISODateString;
  project: Project;
  threadId?: string;
  prompt: {
    fingerprint: string;
    summary: string;
  };
  limits: {
    maxItems: number;
    maxTokens: number;
  };
  ranking: {
    mode: ContextRankingMode;
    model?: string;
    reason: string;
  };
  items: ContextDatum[];
  composedContext: string;
  estimatedTokens: number;
  omittedCount: number;
  auditEventId: string;
}

export interface ContextInjectionAuditMetadata {
  bundleId: string;
  promptFingerprint: string;
  rankingMode: ContextRankingMode;
  model?: string;
  contextDatumIds: string[];
  sources: ContextSourceReference[];
  suppliedItems: ContextDatum[];
  composedContext: string;
  estimatedTokens: number;
  omittedCount: number;
}
