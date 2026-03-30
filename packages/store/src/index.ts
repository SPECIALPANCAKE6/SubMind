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

export interface SubMindStoreSnapshot {
  profiles: Profile[];
  projects: Project[];
  sessions: Session[];
  threads: Thread[];
  tasks: Task[];
  events: Event[];
  fileChanges: FileChange[];
  memory: MemoryItem[];
  guidance: GuidanceItem[];
  actions: ActionItem[];
}

export function createEmptyStoreSnapshot(): SubMindStoreSnapshot {
  return {
    profiles: [],
    projects: [],
    sessions: [],
    threads: [],
    tasks: [],
    events: [],
    fileChanges: [],
    memory: [],
    guidance: [],
    actions: []
  };
}

