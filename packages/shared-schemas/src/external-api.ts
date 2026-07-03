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
