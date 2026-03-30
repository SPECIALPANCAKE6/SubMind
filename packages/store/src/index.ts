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

export * from "./schema.js";

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

export interface SubMindRepository {
  getSnapshot(): Promise<SubMindStoreSnapshot>;
}

const sessionStatusRank: Record<Session["status"], number> = {
  active: 0,
  idle: 1,
  completed: 2
};

const threadStatusRank: Record<Thread["status"], number> = {
  open: 0,
  idle: 1,
  closed: 2
};

const taskStatusRank: Record<Task["status"], number> = {
  active: 0,
  blocked: 1,
  queued: 2,
  completed: 3
};

const guidanceStateRank: Record<GuidanceItem["state"], number> = {
  injected: 0,
  candidate: 1,
  suggested: 2,
  suppressed: 3,
  resolved: 4
};

const actionStateRank: Record<ActionItem["state"], number> = {
  pending: 0,
  in_progress: 1,
  blocked: 2,
  approved: 3,
  rejected: 4,
  resolved: 5
};

const actionRiskRank: Record<ActionItem["riskLevel"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

function compareDescending(left: string, right: string): number {
  return right.localeCompare(left);
}

function sortSessions(items: Session[]): Session[] {
  return [...items].sort((left, right) => {
    const statusDelta =
      sessionStatusRank[left.status] - sessionStatusRank[right.status];

    if (statusDelta !== 0) {
      return statusDelta;
    }

    return (
      compareDescending(left.updatedAt, right.updatedAt) ||
      compareDescending(left.startedAt, right.startedAt)
    );
  });
}

function sortThreads(items: Thread[]): Thread[] {
  return [...items].sort((left, right) => {
    const statusDelta =
      threadStatusRank[left.status] - threadStatusRank[right.status];

    if (statusDelta !== 0) {
      return statusDelta;
    }

    return compareDescending(left.updatedAt, right.updatedAt);
  });
}

function sortTasks(items: Task[]): Task[] {
  return [...items].sort((left, right) => {
    const statusDelta = taskStatusRank[left.status] - taskStatusRank[right.status];

    if (statusDelta !== 0) {
      return statusDelta;
    }

    return compareDescending(left.updatedAt, right.updatedAt);
  });
}

function sortEvents(items: Event[]): Event[] {
  return [...items].sort((left, right) =>
    compareDescending(left.timestamp, right.timestamp)
  );
}

function sortMemory(items: MemoryItem[]): MemoryItem[] {
  return [...items].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1;
    }

    return (
      compareDescending(left.updatedAt, right.updatedAt) ||
      right.confidence - left.confidence
    );
  });
}

function sortGuidance(items: GuidanceItem[]): GuidanceItem[] {
  return [...items].sort((left, right) => {
    const stateDelta =
      guidanceStateRank[left.state] - guidanceStateRank[right.state];

    if (stateDelta !== 0) {
      return stateDelta;
    }

    return compareDescending(left.updatedAt, right.updatedAt);
  });
}

function sortActions(items: ActionItem[]): ActionItem[] {
  return [...items].sort((left, right) => {
    const stateDelta = actionStateRank[left.state] - actionStateRank[right.state];

    if (stateDelta !== 0) {
      return stateDelta;
    }

    const riskDelta =
      actionRiskRank[left.riskLevel] - actionRiskRank[right.riskLevel];

    if (riskDelta !== 0) {
      return riskDelta;
    }

    return compareDescending(left.updatedAt, right.updatedAt);
  });
}

export function cloneStoreSnapshot(
  snapshot: SubMindStoreSnapshot
): SubMindStoreSnapshot {
  return structuredClone(snapshot);
}

export function createPreviewRepository(
  snapshot: SubMindStoreSnapshot = createPreviewStoreSnapshot()
): SubMindRepository {
  return {
    async getSnapshot() {
      return cloneStoreSnapshot(snapshot);
    }
  };
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

export function getProjectById(
  snapshot: SubMindStoreSnapshot,
  projectId: string
): Project | null {
  return snapshot.projects.find((project) => project.id === projectId) ?? null;
}

export function getProjectSessions(
  snapshot: SubMindStoreSnapshot,
  projectId: string
): Session[] {
  return sortSessions(
    snapshot.sessions.filter((session) => session.projectId === projectId)
  );
}

export function getSessionThreads(
  snapshot: SubMindStoreSnapshot,
  sessionId: string
): Thread[] {
  return sortThreads(
    snapshot.threads.filter((thread) => thread.sessionId === sessionId)
  );
}

export function getSessionTasks(
  snapshot: SubMindStoreSnapshot,
  sessionId: string
): Task[] {
  return sortTasks(snapshot.tasks.filter((task) => task.sessionId === sessionId));
}

export function getProjectEvents(
  snapshot: SubMindStoreSnapshot,
  projectId: string
): Event[] {
  return sortEvents(
    snapshot.events.filter((event) => event.projectId === projectId)
  );
}

export function getProjectMemoryItems(
  snapshot: SubMindStoreSnapshot,
  projectId: string | null
): MemoryItem[] {
  return sortMemory(
    snapshot.memory.filter((memoryItem) =>
      projectId ? memoryItem.projectId === projectId : !memoryItem.projectId
    )
  );
}

export function getProjectGuidanceItems(
  snapshot: SubMindStoreSnapshot,
  projectId: string
): GuidanceItem[] {
  return sortGuidance(
    snapshot.guidance.filter((guidanceItem) => guidanceItem.projectId === projectId)
  );
}

export function getProjectActionItems(
  snapshot: SubMindStoreSnapshot,
  projectId: string
): ActionItem[] {
  return sortActions(
    snapshot.actions.filter((actionItem) => actionItem.projectId === projectId)
  );
}

export function getProjectFileChanges(
  snapshot: SubMindStoreSnapshot,
  projectId: string
): FileChange[] {
  return [...snapshot.fileChanges]
    .filter((fileChange) => fileChange.projectId === projectId)
    .sort((left, right) => compareDescending(left.updatedAt, right.updatedAt));
}

export function getPrimarySessionThread(
  snapshot: SubMindStoreSnapshot,
  sessionId: string
): Thread | null {
  return getSessionThreads(snapshot, sessionId)[0] ?? null;
}

export function getPrimarySessionTask(
  snapshot: SubMindStoreSnapshot,
  sessionId: string
): Task | null {
  return getSessionTasks(snapshot, sessionId)[0] ?? null;
}

export function createPreviewStoreSnapshot(): SubMindStoreSnapshot {
  const profile: Profile = {
    kind: "Profile",
    id: "profile-operator",
    displayName: "Operator",
    defaultProjectId: "project-submind",
    metadata: { mode: "preview" },
    createdAt: "2026-03-28T08:00:00.000Z",
    updatedAt: "2026-03-30T10:00:00.000Z"
  };

  const projects: Project[] = [
    {
      kind: "Project",
      id: "project-submind",
      profileId: profile.id,
      name: "SubMind",
      description: "Operator-first control plane",
      summary:
        "Tauri operator console for work trace, memory, guidance, and action control.",
      workspacePath: "C:/Users/xtrem/OneDrive/Documents/codecraft/SubMind",
      repositoryRemote: "git@github.com:xtrem/SubMind.git",
      descriptors: ["desktop app", "tauri", "typescript", "operator-first"],
      createdAt: "2026-03-30T00:00:00.000Z",
      updatedAt: "2026-03-30T10:00:00.000Z"
    },
    {
      kind: "Project",
      id: "project-atlas",
      profileId: profile.id,
      name: "Atlas Ops",
      description: "Cross-project operational visibility",
      summary:
        "Operational drift monitoring and escalation control for active systems.",
      workspacePath: "C:/Workspaces/AtlasOps",
      repositoryRemote: "git@github.com:xtrem/AtlasOps.git",
      descriptors: ["ops", "monitoring", "control-plane"],
      createdAt: "2026-03-29T00:00:00.000Z",
      updatedAt: "2026-03-30T08:10:00.000Z"
    },
    {
      kind: "Project",
      id: "project-ledger",
      profileId: profile.id,
      name: "Memory Ledger",
      description: "Persistent intelligence traces",
      summary:
        "Archive and recall system for constraints, architecture notes, and memory.",
      workspacePath: "C:/Workspaces/MemoryLedger",
      descriptors: ["memory", "archive", "knowledge"],
      createdAt: "2026-03-28T00:00:00.000Z",
      updatedAt: "2026-03-30T07:15:00.000Z"
    }
  ];

  const sessions: Session[] = [
    {
      kind: "Session",
      id: "session-submind-current",
      profileId: profile.id,
      projectId: "project-submind",
      status: "active",
      summary: "React shell migration and schema realignment.",
      startedAt: "2026-03-30T09:10:00.000Z",
      createdAt: "2026-03-30T09:10:00.000Z",
      updatedAt: "2026-03-30T09:52:00.000Z"
    },
    {
      kind: "Session",
      id: "session-atlas-audit",
      profileId: profile.id,
      projectId: "project-atlas",
      status: "idle",
      summary: "Operational drift review with action triage.",
      startedAt: "2026-03-30T06:30:00.000Z",
      createdAt: "2026-03-30T06:30:00.000Z",
      updatedAt: "2026-03-30T06:55:00.000Z"
    },
    {
      kind: "Session",
      id: "session-ledger-review",
      profileId: profile.id,
      projectId: "project-ledger",
      status: "idle",
      summary: "Recall normalization and stale-memory review.",
      startedAt: "2026-03-30T05:45:00.000Z",
      createdAt: "2026-03-30T05:45:00.000Z",
      updatedAt: "2026-03-30T06:10:00.000Z"
    }
  ];

  const threads: Thread[] = [
    {
      kind: "Thread",
      id: "thread-submind-migration",
      sessionId: "session-submind-current",
      projectId: "project-submind",
      title: "Stack migration and shell reshape",
      status: "open",
      summary: "React/Tailwind/Zustand/TanStack/Drizzle migration path.",
      createdAt: "2026-03-30T09:10:00.000Z",
      updatedAt: "2026-03-30T09:52:00.000Z"
    },
    {
      kind: "Thread",
      id: "thread-submind-native",
      sessionId: "session-submind-current",
      projectId: "project-submind",
      title: "Native shell verification",
      status: "idle",
      summary: "Validate resize behavior and command-strip interactions.",
      createdAt: "2026-03-30T09:24:00.000Z",
      updatedAt: "2026-03-30T09:36:00.000Z"
    },
    {
      kind: "Thread",
      id: "thread-atlas-drift",
      sessionId: "session-atlas-audit",
      projectId: "project-atlas",
      title: "Operational drift review",
      status: "idle",
      summary: "Audit escalation load and stale guidance.",
      createdAt: "2026-03-30T06:30:00.000Z",
      updatedAt: "2026-03-30T06:55:00.000Z"
    },
    {
      kind: "Thread",
      id: "thread-ledger-memory",
      sessionId: "session-ledger-review",
      projectId: "project-ledger",
      title: "Recall normalization review",
      status: "idle",
      summary: "Normalize stale memory cards and evidence links.",
      createdAt: "2026-03-30T05:45:00.000Z",
      updatedAt: "2026-03-30T06:10:00.000Z"
    }
  ];

  const tasks: Task[] = [
    {
      kind: "Task",
      id: "task-submind-react",
      sessionId: "session-submind-current",
      threadId: "thread-submind-migration",
      projectId: "project-submind",
      title: "Move the shell to React and Zustand",
      status: "active",
      priority: "high",
      summary: "Replace string rendering and centralize interactive shell state.",
      createdAt: "2026-03-30T09:14:00.000Z",
      updatedAt: "2026-03-30T09:50:00.000Z"
    },
    {
      kind: "Task",
      id: "task-submind-schema",
      sessionId: "session-submind-current",
      threadId: "thread-submind-migration",
      projectId: "project-submind",
      title: "Realign Project, Event, and ActionItem contracts",
      status: "queued",
      priority: "high",
      summary: "Remove UI state from Project and enrich Event/ActionItem shape.",
      createdAt: "2026-03-30T09:20:00.000Z",
      updatedAt: "2026-03-30T09:42:00.000Z"
    },
    {
      kind: "Task",
      id: "task-submind-native",
      sessionId: "session-submind-current",
      threadId: "thread-submind-native",
      projectId: "project-submind",
      title: "Verify Tauri window behavior",
      status: "blocked",
      priority: "medium",
      summary: "Confirm native shell interactions after migration.",
      createdAt: "2026-03-30T09:28:00.000Z",
      updatedAt: "2026-03-30T09:36:00.000Z"
    },
    {
      kind: "Task",
      id: "task-atlas-drift",
      sessionId: "session-atlas-audit",
      threadId: "thread-atlas-drift",
      projectId: "project-atlas",
      title: "Review drift and escalation load",
      status: "active",
      priority: "medium",
      summary: "Audit drift indicators and confirm operator-owned remediations.",
      createdAt: "2026-03-30T06:32:00.000Z",
      updatedAt: "2026-03-30T06:55:00.000Z"
    },
    {
      kind: "Task",
      id: "task-ledger-normalize",
      sessionId: "session-ledger-review",
      threadId: "thread-ledger-memory",
      projectId: "project-ledger",
      title: "Normalize recall summaries",
      status: "queued",
      priority: "medium",
      summary: "Bring stale memory cards back into a consistent narrative shape.",
      createdAt: "2026-03-30T05:48:00.000Z",
      updatedAt: "2026-03-30T06:10:00.000Z"
    }
  ];

  const events: Event[] = [
    {
      kind: "Event",
      id: "event-submind-shell",
      projectId: "project-submind",
      sessionId: "session-submind-current",
      threadId: "thread-submind-migration",
      taskId: "task-submind-react",
      originType: "codex",
      eventType: "renderer-migration",
      category: "work_change",
      nodeCategory: "change",
      timestamp: "2026-03-30T09:46:00.000Z",
      summary: "Renderer migration shifted the shell from string output toward React composition.",
      metadata: {
        target: "apps/desktop",
        stack: ["React", "Tailwind", "Zustand", "TanStack Query"]
      },
      createdAt: "2026-03-30T09:46:00.000Z",
      updatedAt: "2026-03-30T09:46:00.000Z"
    },
    {
      kind: "Event",
      id: "event-submind-schema",
      projectId: "project-submind",
      sessionId: "session-submind-current",
      threadId: "thread-submind-migration",
      taskId: "task-submind-schema",
      originType: "submind",
      eventType: "schema-realignment",
      category: "lifecycle",
      nodeCategory: "control",
      timestamp: "2026-03-30T09:42:00.000Z",
      summary: "Project, Event, and ActionItem direction conflicts were queued for realignment.",
      metadata: {
        entities: ["Project", "Event", "ActionItem"]
      },
      createdAt: "2026-03-30T09:42:00.000Z",
      updatedAt: "2026-03-30T09:42:00.000Z"
    },
    {
      kind: "Event",
      id: "event-atlas-guidance",
      projectId: "project-atlas",
      sessionId: "session-atlas-audit",
      threadId: "thread-atlas-drift",
      originType: "submind",
      eventType: "guidance-candidate",
      category: "guidance",
      nodeCategory: "cognitive",
      guidanceItemId: "guidance-atlas-drift",
      timestamp: "2026-03-30T06:48:00.000Z",
      summary: "A high-signal guidance package was generated for Atlas drift review.",
      metadata: {
        confidence: 0.81
      },
      createdAt: "2026-03-30T06:48:00.000Z",
      updatedAt: "2026-03-30T06:48:00.000Z"
    },
    {
      kind: "Event",
      id: "event-atlas-action",
      projectId: "project-atlas",
      sessionId: "session-atlas-audit",
      threadId: "thread-atlas-drift",
      taskId: "task-atlas-drift",
      originType: "submind",
      eventType: "action-candidate",
      category: "action",
      nodeCategory: "control",
      actionItemId: "action-atlas-escalation",
      timestamp: "2026-03-30T06:50:00.000Z",
      summary: "Atlas audit surfaced an operator approval action around escalation thresholds.",
      metadata: {
        riskLevel: "high"
      },
      createdAt: "2026-03-30T06:50:00.000Z",
      updatedAt: "2026-03-30T06:50:00.000Z"
    },
    {
      kind: "Event",
      id: "event-ledger-memory",
      projectId: "project-ledger",
      sessionId: "session-ledger-review",
      threadId: "thread-ledger-memory",
      taskId: "task-ledger-normalize",
      originType: "submind",
      eventType: "memory-refresh",
      category: "memory",
      nodeCategory: "cognitive",
      memoryItemId: "memory-ledger-constraints",
      timestamp: "2026-03-30T06:02:00.000Z",
      summary: "Ledger recall normalization marked one architecture memory as stale and awaiting confirmation.",
      metadata: {
        freshness: 0.42
      },
      createdAt: "2026-03-30T06:02:00.000Z",
      updatedAt: "2026-03-30T06:02:00.000Z"
    }
  ];

  const fileChanges: FileChange[] = [
    {
      kind: "FileChange",
      id: "change-main",
      eventId: "event-submind-shell",
      projectId: "project-submind",
      sessionId: "session-submind-current",
      threadId: "thread-submind-migration",
      taskId: "task-submind-react",
      path: "apps/desktop/src/main.tsx",
      changeType: "updated",
      summary: "Replaced the imperative shell wiring with a React entrypoint.",
      diffPreview: "createRoot(app).render(<DesktopApp />)",
      language: "typescript",
      fileType: "source",
      gitRef: "HEAD",
      createdAt: "2026-03-30T09:47:00.000Z",
      updatedAt: "2026-03-30T09:47:00.000Z"
    },
    {
      kind: "FileChange",
      id: "change-shell",
      eventId: "event-submind-shell",
      projectId: "project-submind",
      sessionId: "session-submind-current",
      threadId: "thread-submind-migration",
      taskId: "task-submind-react",
      path: "packages/ui-components/src/index.tsx",
      changeType: "updated",
      summary: "Shell component converted to React and Tailwind markup.",
      diffPreview: "<SubMindShell viewModel={viewModel} actions={actions} />",
      language: "typescript",
      fileType: "source",
      gitRef: "HEAD",
      createdAt: "2026-03-30T09:48:00.000Z",
      updatedAt: "2026-03-30T09:48:00.000Z"
    }
  ];

  const memory: MemoryItem[] = [
    {
      kind: "MemoryItem",
      id: "memory-global-shell",
      bucket: "workflow_patterns",
      status: "active",
      summary: "Operator shell changes should stay reversible and schema-led.",
      content:
        "Avoid coupling project selection/focus to persisted project data. Keep state in UI layers and persistence underneath.",
      confidence: 0.94,
      freshness: 0.91,
      isPinned: true,
      isEdited: false,
      createdAt: "2026-03-29T17:10:00.000Z",
      updatedAt: "2026-03-30T09:40:00.000Z"
    },
    {
      kind: "MemoryItem",
      id: "memory-submind-architecture",
      projectId: "project-submind",
      sessionId: "session-submind-current",
      bucket: "architecture_notes",
      status: "active",
      summary: "Desktop app must stay thin while packages own logic and persistence.",
      content:
        "apps/desktop hosts providers and window wiring only. Store, state derivation, and reusable shell pieces belong in packages.",
      confidence: 0.92,
      freshness: 0.86,
      isPinned: true,
      isEdited: false,
      createdAt: "2026-03-30T09:18:00.000Z",
      updatedAt: "2026-03-30T09:41:00.000Z"
    },
    {
      kind: "MemoryItem",
      id: "memory-atlas-risk",
      projectId: "project-atlas",
      sessionId: "session-atlas-audit",
      bucket: "gotchas",
      status: "active",
      summary: "Escalation tuning can over-fire when backlog lag exceeds one hour.",
      content:
        "Atlas Ops must keep escalation thresholds conservative during indexing lag, or operator noise spikes.",
      confidence: 0.79,
      freshness: 0.73,
      isPinned: false,
      isEdited: false,
      createdAt: "2026-03-30T06:33:00.000Z",
      updatedAt: "2026-03-30T06:49:00.000Z"
    },
    {
      kind: "MemoryItem",
      id: "memory-ledger-constraints",
      projectId: "project-ledger",
      sessionId: "session-ledger-review",
      threadId: "thread-ledger-memory",
      bucket: "architecture_notes",
      status: "stale",
      summary: "Archive freshness scoring still needs a stronger confirmation loop.",
      content:
        "Freshness markers degrade well, but stale confirmation is still too passive for high-value architecture notes.",
      confidence: 0.64,
      freshness: 0.42,
      isPinned: false,
      isEdited: true,
      createdAt: "2026-03-29T15:05:00.000Z",
      updatedAt: "2026-03-30T06:02:00.000Z"
    }
  ];

  const guidance: GuidanceItem[] = [
    {
      kind: "GuidanceItem",
      id: "guidance-submind-stack",
      projectId: "project-submind",
      sessionId: "session-submind-current",
      threadId: "thread-submind-migration",
      title: "Land the stack migration before deeper feature work",
      summary: "Move renderer, state, and store boundaries first so later screens build on the right stack.",
      rationale:
        "The current string-rendered shell and schema drift will amplify rework if Memory and Actions continue on the old path.",
      state: "injected",
      source: "policy",
      linkedMemoryItemIds: ["memory-global-shell", "memory-submind-architecture"],
      createdAt: "2026-03-30T09:38:00.000Z",
      updatedAt: "2026-03-30T09:39:00.000Z"
    },
    {
      kind: "GuidanceItem",
      id: "guidance-atlas-drift",
      projectId: "project-atlas",
      sessionId: "session-atlas-audit",
      threadId: "thread-atlas-drift",
      title: "Narrow escalation thresholds before the next batch window",
      summary: "Treat backlog lag as context, not immediate incident signal, until indexing stabilizes.",
      rationale:
        "Recent audit history shows false-positive escalation pressure when indexing jitter overlaps regular deploy windows.",
      state: "candidate",
      source: "model",
      linkedMemoryItemIds: ["memory-atlas-risk"],
      createdAt: "2026-03-30T06:46:00.000Z",
      updatedAt: "2026-03-30T06:48:00.000Z"
    },
    {
      kind: "GuidanceItem",
      id: "guidance-ledger-refresh",
      projectId: "project-ledger",
      sessionId: "session-ledger-review",
      threadId: "thread-ledger-memory",
      title: "Confirm stale architecture memories with stronger evidence",
      summary: "Bring stale items into an evidence-first review flow rather than silently archiving them.",
      rationale:
        "The stale marker is credible, but the memory still influences current design guidance and needs explicit confirmation.",
      state: "suggested",
      source: "model",
      linkedMemoryItemIds: ["memory-ledger-constraints"],
      createdAt: "2026-03-30T05:58:00.000Z",
      updatedAt: "2026-03-30T06:04:00.000Z"
    }
  ];

  const actions: ActionItem[] = [
    {
      kind: "ActionItem",
      id: "action-submind-schema",
      projectId: "project-submind",
      sessionId: "session-submind-current",
      threadId: "thread-submind-migration",
      title: "Approve schema realignment for Project, Event, and ActionItem",
      summary:
        "Core entity direction changed enough that the shell migration should land on the corrected contracts.",
      state: "pending",
      riskLevel: "high",
      riskSummary:
        "Continuing on the old entity shapes will harden the wrong architecture into the new React shell.",
      riskFactors: [
        "Project selection persisted in entity data",
        "Event records missing origin/type/category fields",
        "Action records lack risk and outcome capture"
      ],
      expectedOutcome:
        "Shared schemas, store selectors, and shell projections align on the corrected contracts.",
      owner: "operator",
      createdAt: "2026-03-30T09:35:00.000Z",
      updatedAt: "2026-03-30T09:44:00.000Z"
    },
    {
      kind: "ActionItem",
      id: "action-atlas-escalation",
      projectId: "project-atlas",
      sessionId: "session-atlas-audit",
      threadId: "thread-atlas-drift",
      title: "Approve narrower escalation thresholds for backlog lag",
      summary:
        "Atlas Ops is overreacting to indexing lag and needs a tighter approval gate before policy expands alerts.",
      state: "in_progress",
      riskLevel: "high",
      riskSummary:
        "If the threshold stays wide, operator attention will drift from real incidents during the next deployment window.",
      riskFactors: [
        "recent false positives",
        "indexing lag overlap with deploy windows",
        "operator fatigue"
      ],
      expectedOutcome:
        "Escalation only triggers when lag and deploy indicators both cross the stronger threshold.",
      owner: "operator",
      createdAt: "2026-03-30T06:45:00.000Z",
      updatedAt: "2026-03-30T06:54:00.000Z"
    },
    {
      kind: "ActionItem",
      id: "action-ledger-review",
      projectId: "project-ledger",
      sessionId: "session-ledger-review",
      threadId: "thread-ledger-memory",
      title: "Review stale architecture memory before archive downgrade",
      summary:
        "One architecture note is stale but still linked into current guidance, so it needs operator review.",
      state: "blocked",
      riskLevel: "medium",
      riskSummary:
        "Archiving the memory too aggressively could erase a still-relevant architecture constraint.",
      riskFactors: ["low freshness", "active guidance link", "edited memory history"],
      expectedOutcome:
        "Memory is either reconfirmed with fresh evidence or cleanly superseded with provenance.",
      owner: "operator",
      createdAt: "2026-03-30T05:57:00.000Z",
      updatedAt: "2026-03-30T06:08:00.000Z"
    }
  ];

  return {
    profiles: [profile],
    projects,
    sessions,
    threads,
    tasks,
    events,
    fileChanges,
    memory,
    guidance,
    actions
  };
}
