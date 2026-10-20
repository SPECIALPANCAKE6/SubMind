import type {
  ActionItem,
  ExternalProjectExport,
  ExternalProjectSummary,
  Event,
  FileChange,
  GuidanceItem,
  MemoryItem,
  Profile,
  ProjectCollectionCounts,
  Project,
  SettingsConfigDraft,
  Session,
  Task,
  Thread
} from "@submind/shared-schemas";
import {
  normalizeSettingsConfig,
  resetSettingsConfigDraft,
  subMindExternalApiVersion
} from "@submind/shared-schemas";
import { redactSensitiveObject, redactSensitiveText } from "@submind/policy";
import {
  normalizeProjectWorkspaceAliases,
  reconcileStoreSnapshotsProjectIdentity
} from "./project-identity.js";

export * from "./schema.js";
export * from "./project-identity.js";

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

export interface ActionStateTransitionInput {
  actionId: string;
  nextState: ActionItem["state"];
  actualOutcome?: string;
  actor?: ActionItem["owner"];
  timestamp?: string;
}

export interface MemoryCurationInput {
  memoryId: string;
  summary: string;
  content: string;
  status: MemoryItem["status"];
  isPinned: boolean;
  curationState: MemoryItem["curationState"];
  changeSummary?: string;
  actor?: ActionItem["owner"];
  timestamp?: string;
}

export interface GeneratedProposalBatch {
  tasks?: Task[];
  memory: MemoryItem[];
  guidance: GuidanceItem[];
}

export interface GuidanceReviewInput {
  guidanceId: string;
  nextState: Extract<GuidanceItem["state"], "suggested" | "suppressed">;
  timestamp?: string;
}

export interface TaskReviewInput {
  taskId: string;
  decision: "accept" | "reject";
  timestamp?: string;
}

export interface ContextEligibilityInput {
  entityKind: "MemoryItem" | "GuidanceItem" | "Task";
  entityId: string;
  isEligible: boolean;
  timestamp?: string;
}

export interface RevertProposalReviewInput {
  eventId: string;
  timestamp?: string;
}

export interface ProjectWorkspaceAliasesInput {
  projectId: string;
  workspaceAliases: string[];
  timestamp?: string;
}

export interface EventHistoryQueryInput {
  projectId?: string;
  sessionId?: string;
  threadId?: string;
  taskId?: string;
  actionItemId?: string;
  guidanceItemId?: string;
  memoryItemId?: string;
  categories?: Event["category"][];
  limit?: number;
}

export interface FileChangeHistoryQueryInput {
  projectId?: string;
  sessionId?: string;
  threadId?: string;
  taskId?: string;
  eventId?: string;
  limit?: number;
}

export interface ProjectSearchInput {
  query?: string;
  limit?: number;
}

export interface ProjectExportQueryInput {
  projectId?: string;
  query?: string;
  generatedAt?: string;
}

export interface SubMindRepository {
  getSnapshot(): Promise<SubMindStoreSnapshot>;
  appendEvents(events: Event[]): Promise<void>;
  appendGeneratedProposals(batch: GeneratedProposalBatch): Promise<void>;
  getSettingsConfig(): Promise<SettingsConfigDraft>;
  updateSettingsConfig(input: SettingsConfigDraft): Promise<SettingsConfigDraft>;
  updateProjectWorkspaceAliases(input: ProjectWorkspaceAliasesInput): Promise<Project>;
  searchProjects(input?: ProjectSearchInput): Promise<ExternalProjectSummary[]>;
  getProjectExport(input: ProjectExportQueryInput): Promise<ExternalProjectExport | null>;
  getEventHistory(input?: EventHistoryQueryInput): Promise<Event[]>;
  getFileChangeHistory(input?: FileChangeHistoryQueryInput): Promise<FileChange[]>;
  getActionHistory(actionId: string, limit?: number): Promise<Event[]>;
  transitionAction(input: ActionStateTransitionInput): Promise<ActionItem>;
  updateMemoryItem(input: MemoryCurationInput): Promise<MemoryItem>;
  reviewGuidanceItem(input: GuidanceReviewInput): Promise<GuidanceItem>;
  reviewTask(input: TaskReviewInput): Promise<Task>;
  setContextEligibility(input: ContextEligibilityInput): Promise<void>;
  revertProposalReview(input: RevertProposalReviewInput): Promise<Event>;
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
  proposed: 0,
  active: 0,
  blocked: 1,
  queued: 2,
  completed: 3,
  rejected: 4
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

function sortProfiles(items: Profile[]): Profile[] {
  return [...items].sort((left, right) =>
    compareDescending(left.updatedAt, right.updatedAt) ||
    compareDescending(left.createdAt, right.createdAt)
  );
}

function sortProjects(items: Project[]): Project[] {
  return [...items].sort((left, right) =>
    compareDescending(left.updatedAt, right.updatedAt) ||
    compareDescending(left.createdAt, right.createdAt)
  );
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

function sortFileChanges(items: FileChange[]): FileChange[] {
  return [...items].sort((left, right) =>
    compareDescending(left.updatedAt, right.updatedAt)
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

function earliestTimestamp(left: string, right: string): string {
  return left.localeCompare(right) <= 0 ? left : right;
}

function latestTimestamp(left: string, right: string): string {
  return left.localeCompare(right) >= 0 ? left : right;
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function mergeProfiles(items: Profile[]): Profile[] {
  const profilesById = new Map<string, Profile>();

  for (const profile of items) {
    const existing = profilesById.get(profile.id);

    if (!existing) {
      profilesById.set(profile.id, profile);
      continue;
    }

    const incomingIsNewer = profile.updatedAt.localeCompare(existing.updatedAt) >= 0;
    const defaultProjectId =
      (incomingIsNewer ? profile.defaultProjectId : existing.defaultProjectId) ??
      existing.defaultProjectId ??
      profile.defaultProjectId;

    const mergedProfile: Profile = {
      kind: "Profile",
      id: existing.id,
      displayName:
        (incomingIsNewer ? profile.displayName : existing.displayName) ||
        existing.displayName ||
        profile.displayName,
      metadata: {
        ...existing.metadata,
        ...profile.metadata
      },
      createdAt: earliestTimestamp(existing.createdAt, profile.createdAt),
      updatedAt: latestTimestamp(existing.updatedAt, profile.updatedAt)
    };

    if (defaultProjectId) {
      mergedProfile.defaultProjectId = defaultProjectId;
    }

    profilesById.set(profile.id, mergedProfile);
  }

  return sortProfiles([...profilesById.values()]);
}

function mergeProjects(items: Project[]): Project[] {
  const projectsById = new Map<string, Project>();

  for (const project of items) {
    const existing = projectsById.get(project.id);

    if (!existing) {
      projectsById.set(project.id, project);
      continue;
    }

    const incomingIsNewer = project.updatedAt.localeCompare(existing.updatedAt) >= 0;
    const description =
      (incomingIsNewer ? project.description : existing.description) ??
      existing.description ??
      project.description;
    const summary =
      (incomingIsNewer ? project.summary : existing.summary) ??
      existing.summary ??
      project.summary;
    const workspacePath =
      (incomingIsNewer ? project.workspacePath : existing.workspacePath) ??
      existing.workspacePath ??
      project.workspacePath;
    const repositoryRemote =
      (incomingIsNewer ? project.repositoryRemote : existing.repositoryRemote) ??
      existing.repositoryRemote ??
      project.repositoryRemote;
    const workspaceAliases = [
      ...(existing.workspaceAliases ?? []),
      ...(project.workspaceAliases ?? [])
    ];

    const mergedProject: Project = {
      kind: "Project",
      id: existing.id,
      profileId: incomingIsNewer ? project.profileId : existing.profileId,
      name: incomingIsNewer ? project.name : existing.name,
      descriptors: [...new Set([...existing.descriptors, ...project.descriptors])],
      createdAt: earliestTimestamp(existing.createdAt, project.createdAt),
      updatedAt: latestTimestamp(existing.updatedAt, project.updatedAt)
    };

    if (description) {
      mergedProject.description = description;
    }

    if (summary) {
      mergedProject.summary = summary;
    }

    if (workspacePath) {
      mergedProject.workspacePath = workspacePath;
    }

    if (workspaceAliases.length > 0) {
      mergedProject.workspaceAliases = [...new Set(workspaceAliases)];
    }

    if (repositoryRemote) {
      mergedProject.repositoryRemote = repositoryRemote;
    }

    projectsById.set(project.id, mergedProject);
  }

  return sortProjects([...projectsById.values()]);
}

function createActionTransitionEvent(
  action: ActionItem,
  nextState: ActionItem["state"],
  timestamp: string,
  actor: ActionItem["owner"]
): Event {
  return {
    kind: "Event",
    id: `event-action-${action.id}-${timestamp.replaceAll(/[^0-9]/g, "")}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    projectId: action.projectId,
    ...(action.sessionId ? { sessionId: action.sessionId } : {}),
    ...(action.threadId ? { threadId: action.threadId } : {}),
    actionItemId: action.id,
    originType: "submind",
    eventType: "action-state-transition",
    category: "action",
    nodeCategory: "control",
    timestamp,
    summary: redactSensitiveText(
      `${action.title} moved from ${action.state} to ${nextState}.`
    ).value,
    metadata: {
      actionId: action.id,
      actor,
      previousState: action.state,
      nextState
    }
  };
}

function createMemoryCurationEvent(
  memoryItem: MemoryItem,
  input: MemoryCurationInput,
  timestamp: string,
  actor: ActionItem["owner"]
): Event {
  return {
    kind: "Event",
    id: `event-memory-${memoryItem.id}-${timestamp.replaceAll(/[^0-9]/g, "")}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    projectId: memoryItem.projectId ?? "project-global",
    ...(memoryItem.sessionId ? { sessionId: memoryItem.sessionId } : {}),
    ...(memoryItem.threadId ? { threadId: memoryItem.threadId } : {}),
    memoryItemId: memoryItem.id,
    originType: "submind",
    eventType: "memory-curated",
    category: "memory",
    nodeCategory: "cognitive",
    timestamp,
    summary: redactSensitiveText(
      input.changeSummary ??
        `${memoryItem.summary} was curated as ${input.curationState}.`
    ).value,
    metadata: {
      memoryId: memoryItem.id,
      actor,
      previousStatus: memoryItem.status,
      nextStatus: input.status,
      previousPinned: memoryItem.isPinned,
      nextPinned: input.isPinned,
      previousCurationState: memoryItem.curationState,
      nextCurationState: input.curationState
    }
  };
}

function redactOptionalText(value: string | null | undefined): string | null | undefined {
  return typeof value === "string" ? redactSensitiveText(value).value : value;
}

function redactMemoryCurationInput(input: MemoryCurationInput): MemoryCurationInput {
  return {
    ...input,
    summary: redactSensitiveText(input.summary).value,
    content: redactSensitiveText(input.content).value,
    ...(input.changeSummary
      ? { changeSummary: redactSensitiveText(input.changeSummary).value }
      : {})
  };
}

export function cloneStoreSnapshot(
  snapshot: SubMindStoreSnapshot
): SubMindStoreSnapshot {
  return structuredClone(snapshot);
}

export function queryEventHistoryFromSnapshot(
  snapshot: SubMindStoreSnapshot,
  input: EventHistoryQueryInput = {}
): Event[] {
  const items = sortEvents(
    snapshot.events.filter((event) => {
      if (input.projectId && event.projectId !== input.projectId) {
        return false;
      }

      if (input.sessionId && event.sessionId !== input.sessionId) {
        return false;
      }

      if (input.threadId && event.threadId !== input.threadId) {
        return false;
      }

      if (input.taskId && event.taskId !== input.taskId) {
        return false;
      }

      if (input.actionItemId && event.actionItemId !== input.actionItemId) {
        return false;
      }

      if (
        input.guidanceItemId &&
        event.guidanceItemId !== input.guidanceItemId
      ) {
        return false;
      }

      if (input.memoryItemId && event.memoryItemId !== input.memoryItemId) {
        return false;
      }

      if (
        input.categories &&
        input.categories.length > 0 &&
        !input.categories.includes(event.category)
      ) {
        return false;
      }

      return true;
    })
  );

  return redactSensitiveObject(
    !input.limit || input.limit <= 0 ? items : items.slice(0, input.limit)
  );
}

export function queryFileChangeHistoryFromSnapshot(
  snapshot: SubMindStoreSnapshot,
  input: FileChangeHistoryQueryInput = {}
): FileChange[] {
  const items = sortFileChanges(
    snapshot.fileChanges.filter((fileChange) => {
      if (input.projectId && fileChange.projectId !== input.projectId) {
        return false;
      }

      if (input.sessionId && fileChange.sessionId !== input.sessionId) {
        return false;
      }

      if (input.threadId && fileChange.threadId !== input.threadId) {
        return false;
      }

      if (input.taskId && fileChange.taskId !== input.taskId) {
        return false;
      }

      if (input.eventId && fileChange.eventId !== input.eventId) {
        return false;
      }

      return true;
    })
  );

  return redactSensitiveObject(
    !input.limit || input.limit <= 0 ? items : items.slice(0, input.limit)
  );
}

export function mergeStoreSnapshots(
  snapshots: SubMindStoreSnapshot[]
): SubMindStoreSnapshot {
  const populatedSnapshots = reconcileStoreSnapshotsProjectIdentity(snapshots).filter(
    (snapshot) =>
      snapshot.profiles.length > 0 ||
      snapshot.projects.length > 0 ||
      snapshot.sessions.length > 0 ||
      snapshot.threads.length > 0 ||
      snapshot.tasks.length > 0 ||
      snapshot.events.length > 0 ||
      snapshot.fileChanges.length > 0 ||
      snapshot.memory.length > 0 ||
      snapshot.guidance.length > 0 ||
      snapshot.actions.length > 0
  );

  if (populatedSnapshots.length === 0) {
    return createEmptyStoreSnapshot();
  }

  return {
    profiles: mergeProfiles(
      populatedSnapshots.flatMap((snapshot) => snapshot.profiles)
    ),
    projects: mergeProjects(
      populatedSnapshots.flatMap((snapshot) => snapshot.projects)
    ),
    sessions: sortSessions(
      dedupeById(populatedSnapshots.flatMap((snapshot) => snapshot.sessions))
    ),
    threads: sortThreads(
      dedupeById(populatedSnapshots.flatMap((snapshot) => snapshot.threads))
    ),
    tasks: sortTasks(
      dedupeById(populatedSnapshots.flatMap((snapshot) => snapshot.tasks))
    ),
    events: sortEvents(
      dedupeById(populatedSnapshots.flatMap((snapshot) => snapshot.events))
    ),
    fileChanges: sortFileChanges(
      dedupeById(populatedSnapshots.flatMap((snapshot) => snapshot.fileChanges))
    ),
    memory: sortMemory(
      dedupeById(populatedSnapshots.flatMap((snapshot) => snapshot.memory))
    ),
    guidance: sortGuidance(
      dedupeById(populatedSnapshots.flatMap((snapshot) => snapshot.guidance))
    ),
    actions: sortActions(
      dedupeById(populatedSnapshots.flatMap((snapshot) => snapshot.actions))
    )
  };
}

export function createPreviewRepository(
  snapshot: SubMindStoreSnapshot = createPreviewStoreSnapshot()
): SubMindRepository {
  let liveSnapshot = cloneStoreSnapshot(snapshot);
  let liveSettingsConfig = resetSettingsConfigDraft();

  return {
    async getSnapshot() {
      return cloneStoreSnapshot(liveSnapshot);
    },
    async appendEvents(events) {
      const knownProjects = new Set(liveSnapshot.projects.map((project) => project.id));
      for (const event of events) {
        if (!knownProjects.has(event.projectId)) {
          throw new Error(`Project "${event.projectId}" was not found for event "${event.id}".`);
        }
      }
      liveSnapshot = {
        ...liveSnapshot,
        events: sortEvents(
          dedupeById([
            ...events.map((event) => redactSensitiveObject(event)),
            ...liveSnapshot.events
          ])
        )
      };
    },
    async appendGeneratedProposals(batch) {
      validateGeneratedProposalBatch(liveSnapshot, batch);
      const existingTaskIds = new Set(liveSnapshot.tasks.map((item) => item.id));
      const existingMemoryIds = new Set(liveSnapshot.memory.map((item) => item.id));
      const existingGuidanceIds = new Set(liveSnapshot.guidance.map((item) => item.id));
      liveSnapshot = {
        ...liveSnapshot,
        tasks: sortTasks([
          ...liveSnapshot.tasks,
          ...(batch.tasks ?? [])
            .filter((item) => !existingTaskIds.has(item.id))
            .map((item) => redactSensitiveObject({ ...item, contextEligible: false }))
        ]),
        memory: sortMemory([
          ...liveSnapshot.memory,
          ...batch.memory
            .filter((item) => !existingMemoryIds.has(item.id))
            .map((item) => redactSensitiveObject({ ...item, contextEligible: false }))
        ]),
        guidance: sortGuidance([
          ...liveSnapshot.guidance,
          ...batch.guidance
            .filter((item) => !existingGuidanceIds.has(item.id))
            .map((item) => redactSensitiveObject({ ...item, contextEligible: false }))
        ])
      };
    },
    async getSettingsConfig() {
      return normalizeSettingsConfig(liveSettingsConfig);
    },
    async updateSettingsConfig(input) {
      liveSettingsConfig = normalizeSettingsConfig(input);
      return normalizeSettingsConfig(liveSettingsConfig);
    },
    async updateProjectWorkspaceAliases(input) {
      const projectIndex = liveSnapshot.projects.findIndex(
        (project) => project.id === input.projectId
      );
      const project = liveSnapshot.projects[projectIndex];

      if (!project) {
        throw new Error(`Project "${input.projectId}" was not found.`);
      }

      const updatedProject: Project = {
        ...project,
        workspaceAliases: normalizeProjectWorkspaceAliases(
          project.workspacePath,
          input.workspaceAliases
        ),
        updatedAt: input.timestamp ?? new Date().toISOString()
      };
      const projects = [...liveSnapshot.projects];
      projects[projectIndex] = updatedProject;
      liveSnapshot = mergeStoreSnapshots([
        { ...liveSnapshot, projects: sortProjects(projects) }
      ]);
      const reconciledProject = liveSnapshot.projects.find(
        (item) =>
          item.workspacePath === updatedProject.workspacePath ||
          item.workspaceAliases?.includes(updatedProject.workspacePath ?? "")
      );
      return structuredClone(reconciledProject ?? updatedProject);
    },
    async searchProjects(input = {}) {
      return structuredClone(searchProjects(liveSnapshot, input));
    },
    async getProjectExport(input) {
      const projectExport = resolveProjectExternalExport(liveSnapshot, input);
      return projectExport ? structuredClone(projectExport) : null;
    },
    async getEventHistory(input = {}) {
      return queryEventHistoryFromSnapshot(liveSnapshot, input);
    },
    async getFileChangeHistory(input = {}) {
      return queryFileChangeHistoryFromSnapshot(liveSnapshot, input);
    },
    async getActionHistory(actionId, limit) {
      return queryEventHistoryFromSnapshot(
        liveSnapshot,
        limit === undefined
          ? { actionItemId: actionId }
          : { actionItemId: actionId, limit }
      );
    },
    async transitionAction(input) {
      const actionIndex = liveSnapshot.actions.findIndex(
        (actionItem) => actionItem.id === input.actionId
      );

      if (actionIndex === -1) {
        throw new Error(`Action item "${input.actionId}" was not found.`);
      }

      const previousAction = liveSnapshot.actions[actionIndex];

      if (!previousAction) {
        throw new Error(`Action item "${input.actionId}" was not found.`);
      }

      const timestamp = input.timestamp ?? new Date().toISOString();
      const actor = input.actor ?? "operator";
      const nextActualOutcome = redactOptionalText(
        input.actualOutcome ?? previousAction.actualOutcome
      );
      const nextAction: ActionItem = {
        ...previousAction,
        state: input.nextState,
        ...(nextActualOutcome
          ? { actualOutcome: nextActualOutcome }
          : {}),
        updatedAt: timestamp
      };

      const nextActions = [...liveSnapshot.actions];
      nextActions[actionIndex] = nextAction;
      liveSnapshot = {
        ...liveSnapshot,
        actions: sortActions(nextActions),
        events: sortEvents([
          createActionTransitionEvent(
            previousAction,
            input.nextState,
            timestamp,
            actor
          ),
          ...liveSnapshot.events
        ])
      };

      return redactSensitiveObject(structuredClone(nextAction));
    },
    async updateMemoryItem(input) {
      const safeInput = redactMemoryCurationInput(input);
      const memoryIndex = liveSnapshot.memory.findIndex(
        (memoryItem) => memoryItem.id === safeInput.memoryId
      );

      if (memoryIndex === -1) {
        throw new Error(`Memory item "${safeInput.memoryId}" was not found.`);
      }

      const previousMemory = liveSnapshot.memory[memoryIndex];

      if (!previousMemory) {
        throw new Error(`Memory item "${safeInput.memoryId}" was not found.`);
      }

      const timestamp = safeInput.timestamp ?? new Date().toISOString();
      const actor = safeInput.actor ?? "operator";
      const nextMemory: MemoryItem = {
        ...previousMemory,
        summary: safeInput.summary,
        content: safeInput.content,
        status: safeInput.status,
        isPinned: safeInput.isPinned,
        curationState: safeInput.curationState,
        isEdited: safeInput.curationState === "edited",
        ...(safeInput.changeSummary
          ? { changeSummary: safeInput.changeSummary }
          : previousMemory.changeSummary
            ? { changeSummary: previousMemory.changeSummary }
            : {}),
        updatedAt: timestamp
      };

      const nextMemoryItems = [...liveSnapshot.memory];
      nextMemoryItems[memoryIndex] = nextMemory;
      const curationEvent = createMemoryCurationEvent(
        previousMemory,
        safeInput,
        timestamp,
        actor
      );
      liveSnapshot = {
        ...liveSnapshot,
        memory: sortMemory(nextMemoryItems),
        events: sortEvents([
          {
            ...curationEvent,
            metadata: {
              ...curationEvent.metadata,
              previousEntity: redactSensitiveObject(previousMemory),
              nextEntity: redactSensitiveObject(nextMemory)
            }
          },
          ...liveSnapshot.events
        ])
      };

      return redactSensitiveObject(structuredClone(nextMemory));
    },
    async reviewGuidanceItem(input) {
      const index = liveSnapshot.guidance.findIndex(
        (item) => item.id === input.guidanceId
      );
      const previous = liveSnapshot.guidance[index];
      if (!previous) {
        throw new Error(`Guidance item "${input.guidanceId}" was not found.`);
      }
      if (previous.state !== "candidate") {
        throw new Error("Only candidate guidance can be reviewed.");
      }
      const timestamp = input.timestamp ?? new Date().toISOString();
      const next = { ...previous, state: input.nextState, updatedAt: timestamp };
      const event: Event = {
        kind: "Event",
        id: `event-guidance-review-${previous.id}-${timestamp.replaceAll(/[^0-9]/g, "")}`,
        createdAt: timestamp,
        updatedAt: timestamp,
        projectId: previous.projectId,
        ...(previous.sessionId ? { sessionId: previous.sessionId } : {}),
        ...(previous.threadId ? { threadId: previous.threadId } : {}),
        guidanceItemId: previous.id,
        originType: "user",
        eventType: "guidance-review",
        category: "guidance",
        nodeCategory: "control",
        timestamp,
        summary: redactSensitiveText(
          `Guidance ${previous.title} was ${input.nextState} by the operator.`
        ).value,
        metadata: {
          guidanceId: previous.id,
          previousState: previous.state,
          nextState: input.nextState,
          previousEntity: redactSensitiveObject(previous),
          nextEntity: redactSensitiveObject(next)
        }
      };
      const guidance = [...liveSnapshot.guidance];
      guidance[index] = next;
      liveSnapshot = {
        ...liveSnapshot,
        guidance: sortGuidance(guidance),
        events: sortEvents([event, ...liveSnapshot.events])
      };
      return redactSensitiveObject(structuredClone(next));
    },
    async reviewTask(input) {
      const index = liveSnapshot.tasks.findIndex((item) => item.id === input.taskId);
      const previous = liveSnapshot.tasks[index];
      if (!previous) {
        throw new Error(`Task "${input.taskId}" was not found.`);
      }
      if (previous.source !== "model" || previous.status !== "proposed") {
        throw new Error("Only proposed model-generated tasks can be reviewed.");
      }
      const timestamp = input.timestamp ?? new Date().toISOString();
      const nextStatus: Task["status"] =
        input.decision === "reject"
          ? "rejected"
          : previous.suggestedStatus ?? "queued";
      const next = { ...previous, status: nextStatus, updatedAt: timestamp };
      const event: Event = {
        kind: "Event",
        id: `event-task-review-${previous.id}-${timestamp.replaceAll(/[^0-9]/g, "")}`,
        createdAt: timestamp,
        updatedAt: timestamp,
        projectId: previous.projectId,
        sessionId: previous.sessionId,
        threadId: previous.threadId,
        taskId: previous.id,
        originType: "user",
        eventType: "task-review",
        category: "work_change",
        nodeCategory: "control",
        timestamp,
        summary: redactSensitiveText(
          `Task ${previous.title} was ${input.decision === "accept" ? `accepted as ${nextStatus}` : "rejected"} by the operator.`
        ).value,
        metadata: {
          taskId: previous.id,
          previousStatus: previous.status,
          suggestedStatus: previous.suggestedStatus ?? null,
          nextStatus,
          previousEntity: redactSensitiveObject(previous),
          nextEntity: redactSensitiveObject(next)
        }
      };
      const tasks = [...liveSnapshot.tasks];
      tasks[index] = next;
      liveSnapshot = {
        ...liveSnapshot,
        tasks: sortTasks(tasks),
        events: sortEvents([event, ...liveSnapshot.events])
      };
      return redactSensitiveObject(structuredClone(next));
    },
    async setContextEligibility(input) {
      const timestamp = input.timestamp ?? new Date().toISOString();
      let previous: MemoryItem | GuidanceItem | Task;
      let next: MemoryItem | GuidanceItem | Task;
      let category: Event["category"];
      let reference: Pick<Event, "memoryItemId" | "guidanceItemId" | "taskId">;

      if (input.entityKind === "MemoryItem") {
        const memory = liveSnapshot.memory.find((item) => item.id === input.entityId);
        if (
          !memory ||
          input.isEligible && !["active", "stale"].includes(memory.status)
        ) {
          throw new Error("Only active or stale memory can be made context-eligible.");
        }
        if (memory.contextEligible === input.isEligible) {
          return;
        }
        previous = memory;
        next = { ...memory, contextEligible: input.isEligible, updatedAt: timestamp };
        category = "memory";
        reference = { memoryItemId: memory.id };
        liveSnapshot = {
          ...liveSnapshot,
          memory: sortMemory(
            liveSnapshot.memory.map((item) => item.id === memory.id ? next as MemoryItem : item)
          )
        };
      } else if (input.entityKind === "GuidanceItem") {
        const guidance = liveSnapshot.guidance.find((item) => item.id === input.entityId);
        if (
          !guidance ||
          input.isEligible && ["candidate", "suppressed", "resolved"].includes(guidance.state)
        ) {
          throw new Error("Only reviewed guidance can be made context-eligible.");
        }
        if (guidance.contextEligible === input.isEligible) {
          return;
        }
        previous = guidance;
        next = { ...guidance, contextEligible: input.isEligible, updatedAt: timestamp };
        category = "guidance";
        reference = { guidanceItemId: guidance.id };
        liveSnapshot = {
          ...liveSnapshot,
          guidance: sortGuidance(
            liveSnapshot.guidance.map((item) => item.id === guidance.id ? next as GuidanceItem : item)
          )
        };
      } else {
        const task = liveSnapshot.tasks.find((item) => item.id === input.entityId);
        if (
          !task ||
          input.isEligible && !["queued", "active", "blocked"].includes(task.status)
        ) {
          throw new Error("Only accepted, unresolved tasks can be made context-eligible.");
        }
        if (task.contextEligible === input.isEligible) {
          return;
        }
        previous = task;
        next = { ...task, contextEligible: input.isEligible, updatedAt: timestamp };
        category = "work_change";
        reference = { taskId: task.id };
        liveSnapshot = {
          ...liveSnapshot,
          tasks: sortTasks(
            liveSnapshot.tasks.map((item) => item.id === task.id ? next as Task : item)
          )
        };
      }

      liveSnapshot = {
        ...liveSnapshot,
        events: sortEvents([{
          kind: "Event",
          id: `event-context-eligibility-${input.entityId}-${timestamp.replaceAll(/[^0-9]/g, "")}-${input.isEligible ? "on" : "off"}`,
          createdAt: timestamp,
          updatedAt: timestamp,
          projectId: previous.projectId ?? "project-global",
          ...("sessionId" in previous && previous.sessionId ? { sessionId: previous.sessionId } : {}),
          ...("threadId" in previous && previous.threadId ? { threadId: previous.threadId } : {}),
          ...reference,
          originType: "user",
          eventType: "context-eligibility-changed",
          category,
          nodeCategory: "control",
          timestamp,
          summary: `Context-bundle eligibility was ${input.isEligible ? "enabled" : "disabled"} for ${input.entityKind} ${input.entityId}.`,
          metadata: {
            entityKind: input.entityKind,
            entityId: input.entityId,
            previousEligibility: previous.contextEligible === true,
            nextEligibility: input.isEligible
          }
        }, ...liveSnapshot.events])
      };
    },
    async revertProposalReview(input) {
      const event = liveSnapshot.events.find((item) => item.id === input.eventId);
      if (!event || !["memory-curated", "guidance-review", "task-review"].includes(event.eventType)) {
        throw new Error("The selected history event cannot be reverted.");
      }
      const previous = event.metadata.previousEntity;
      const next = event.metadata.nextEntity;
      if (!previous || !next || typeof previous !== "object" || typeof next !== "object") {
        throw new Error("The selected history event does not contain reversible state.");
      }
      const currentCollection =
        event.eventType === "memory-curated"
          ? liveSnapshot.memory
          : event.eventType === "guidance-review"
            ? liveSnapshot.guidance
            : liveSnapshot.tasks;
      const entityId = event.memoryItemId ?? event.guidanceItemId ?? event.taskId;
      const current = currentCollection.find((item) => item.id === entityId);
      if (
        !current ||
        JSON.stringify(redactSensitiveObject(current)) !== JSON.stringify(next)
      ) {
        throw new Error("This proposal changed after that review; revert the latest history entry instead.");
      }
      const timestamp = input.timestamp ?? new Date().toISOString();
      const restored = { ...(previous as typeof current), updatedAt: timestamp };
      if (event.memoryItemId) {
        liveSnapshot = {
          ...liveSnapshot,
          memory: sortMemory(liveSnapshot.memory.map((item) => item.id === current.id ? restored as MemoryItem : item))
        };
      } else if (event.guidanceItemId) {
        liveSnapshot = {
          ...liveSnapshot,
          guidance: sortGuidance(liveSnapshot.guidance.map((item) => item.id === current.id ? restored as GuidanceItem : item))
        };
      } else if (event.taskId) {
        liveSnapshot = {
          ...liveSnapshot,
          tasks: sortTasks(liveSnapshot.tasks.map((item) => item.id === current.id ? restored as Task : item))
        };
      }
      const revertedEvent: Event = {
        kind: "Event",
        id: `event-proposal-review-reverted-${event.id}-${timestamp.replaceAll(/[^0-9]/g, "")}`,
        createdAt: timestamp,
        updatedAt: timestamp,
        projectId: event.projectId,
        ...(event.sessionId ? { sessionId: event.sessionId } : {}),
        ...(event.threadId ? { threadId: event.threadId } : {}),
        ...(event.taskId ? { taskId: event.taskId } : {}),
        ...(event.guidanceItemId ? { guidanceItemId: event.guidanceItemId } : {}),
        ...(event.memoryItemId ? { memoryItemId: event.memoryItemId } : {}),
        originType: "user",
        eventType: "proposal-review-reverted",
        category: event.category,
        nodeCategory: "control",
        timestamp,
        summary: `Operator reverted review history entry ${event.id}.`,
        metadata: { sourceEventId: event.id }
      };
      liveSnapshot = { ...liveSnapshot, events: sortEvents([revertedEvent, ...liveSnapshot.events]) };
      return structuredClone(revertedEvent);
    }
  };
}

export function validateGeneratedProposalBatch(
  snapshot: SubMindStoreSnapshot,
  batch: GeneratedProposalBatch
): void {
  const projectIds = new Set(snapshot.projects.map((item) => item.id));
  const sessionsById = new Map(snapshot.sessions.map((item) => [item.id, item]));
  const threadsById = new Map(snapshot.threads.map((item) => [item.id, item]));
  const eventsById = new Map(snapshot.events.map((item) => [item.id, item]));
  const filesById = new Map(snapshot.fileChanges.map((item) => [item.id, item]));
  const actionsById = new Map(snapshot.actions.map((item) => [item.id, item]));
  const memoryById = new Map(snapshot.memory.map((item) => [item.id, item]));
  const batchMemoryById = new Map(batch.memory.map((item) => [item.id, item]));

  function assertScope(projectId: string, sessionId?: string, threadId?: string) {
    if (!projectIds.has(projectId)) {
      throw new Error(`Generated proposal project "${projectId}" was not found.`);
    }
    const session = sessionId ? sessionsById.get(sessionId) : undefined;
    const thread = threadId ? threadsById.get(threadId) : undefined;
    if (
      (sessionId && (!session || session.projectId !== projectId)) ||
      (threadId &&
        (!thread ||
          thread.projectId !== projectId ||
          (session && thread.sessionId !== session.id)))
    ) {
      throw new Error("Generated proposal has an invalid project, session, or thread scope.");
    }
  }

  const newMemoryIds = new Set<string>();
  for (const item of batch.memory) {
    if (item.status !== "draft" || item.curationState !== "derived" || item.isPinned || item.isEdited) {
      throw new Error("Generated memory proposals must remain unpinned, derived drafts.");
    }
    if (newMemoryIds.has(item.id)) {
      throw new Error(`Generated memory proposal "${item.id}" appears more than once.`);
    }
    newMemoryIds.add(item.id);
    assertScope(item.projectId ?? "", item.sessionId, item.threadId);
    if (
      item.sourceEventIds.length === 0 &&
      item.sourceFileChangeIds.length === 0
    ) {
      throw new Error("Generated memory proposal requires evidence.");
    }
    for (const eventId of item.sourceEventIds) {
      const event = eventsById.get(eventId);
      if (
        !event ||
        event.projectId !== item.projectId ||
        (item.sessionId && event.sessionId !== item.sessionId) ||
        (item.threadId && event.threadId !== item.threadId)
      ) {
        throw new Error(`Generated memory proposal references invalid event "${eventId}".`);
      }
    }
    for (const fileId of item.sourceFileChangeIds) {
      const file = filesById.get(fileId);
      if (
        !file ||
        file.projectId !== item.projectId ||
        (item.sessionId && file.sessionId !== item.sessionId) ||
        (item.threadId && file.threadId !== item.threadId)
      ) {
        throw new Error(`Generated memory proposal references invalid file change "${fileId}".`);
      }
    }
  }

  const newTaskIds = new Set<string>();
  for (const item of batch.tasks ?? []) {
    if (
      item.source !== "model" ||
      item.status !== "proposed" ||
      !["queued", "active", "blocked", "completed"].includes(
        String(item.suggestedStatus)
      ) ||
      !item.sourceEventIds?.length
    ) {
      throw new Error("Generated tasks must be proposed model tasks with event evidence.");
    }
    if (newTaskIds.has(item.id)) {
      throw new Error(`Generated task proposal "${item.id}" appears more than once.`);
    }
    newTaskIds.add(item.id);
    assertScope(item.projectId, item.sessionId, item.threadId);
    const thread = threadsById.get(item.threadId);
    if (!thread || thread.sessionId !== item.sessionId) {
      throw new Error("Generated task proposal must belong to a thread and its session.");
    }
    for (const eventId of item.sourceEventIds) {
      const event = eventsById.get(eventId);
      if (
        !event ||
        event.projectId !== item.projectId ||
        event.sessionId !== item.sessionId ||
        event.threadId !== item.threadId
      ) {
        throw new Error(`Generated task proposal references invalid event "${eventId}".`);
      }
    }
  }

  const newGuidanceIds = new Set<string>();
  for (const item of batch.guidance) {
    if (item.state !== "candidate" || item.source !== "model") {
      throw new Error("Generated guidance proposals must remain model candidates.");
    }
    if (newGuidanceIds.has(item.id)) {
      throw new Error(`Generated guidance proposal "${item.id}" appears more than once.`);
    }
    newGuidanceIds.add(item.id);
    assertScope(item.projectId, item.sessionId, item.threadId);
    if (item.linkedEventIds.length === 0) {
      throw new Error("Generated guidance proposal requires event evidence.");
    }
    for (const eventId of item.linkedEventIds) {
      const event = eventsById.get(eventId);
      if (
        !event ||
        event.projectId !== item.projectId ||
        (item.sessionId && event.sessionId !== item.sessionId) ||
        (item.threadId && event.threadId !== item.threadId)
      ) {
        throw new Error(`Generated guidance proposal references invalid event "${eventId}".`);
      }
    }
    for (const memoryId of item.linkedMemoryItemIds) {
      const memory = memoryById.get(memoryId) ?? batchMemoryById.get(memoryId);
      if (!memory || (memory.projectId && memory.projectId !== item.projectId)) {
        throw new Error(`Generated guidance proposal references invalid memory "${memoryId}".`);
      }
    }
    for (const actionId of item.linkedActionItemIds) {
      const action = actionsById.get(actionId);
      if (!action || action.projectId !== item.projectId) {
        throw new Error(`Generated guidance proposal references invalid action "${actionId}".`);
      }
    }
  }
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

function normalizeProjectSearchValue(value: string): string {
  return value.replaceAll("\\", "/").toLowerCase();
}

function tokenizeProjectSearchQuery(query: string | undefined): string[] {
  return normalizeProjectSearchValue(query ?? "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function createProjectSearchHaystack(project: Project): string {
  return normalizeProjectSearchValue(
    [
      project.id,
      project.name,
      project.description,
      project.summary,
      project.workspacePath,
      ...(project.workspaceAliases ?? []),
      project.repositoryRemote,
      ...project.descriptors
    ]
      .filter((value): value is string => !!value)
      .join(" ")
  );
}

export function projectMatchesSearchQuery(
  project: Project,
  query: string | undefined
): boolean {
  const tokens = tokenizeProjectSearchQuery(query);

  if (tokens.length === 0) {
    return true;
  }

  const haystack = createProjectSearchHaystack(project);
  return tokens.every((token) => haystack.includes(token));
}

function getProjectScopedCollections(
  snapshot: SubMindStoreSnapshot,
  projectId: string
) {
  return {
    sessions: getProjectSessions(snapshot, projectId),
    threads: sortThreads(
      snapshot.threads.filter((thread) => thread.projectId === projectId)
    ),
    tasks: sortTasks(snapshot.tasks.filter((task) => task.projectId === projectId)),
    events: getProjectEvents(snapshot, projectId),
    fileChanges: getProjectFileChanges(snapshot, projectId),
    memory: getProjectMemoryItems(snapshot, projectId),
    guidance: getProjectGuidanceItems(snapshot, projectId),
    actions: getProjectActionItems(snapshot, projectId)
  };
}

function getProjectCollectionCounts(
  collections: ReturnType<typeof getProjectScopedCollections>
): ProjectCollectionCounts {
  return {
    sessions: collections.sessions.length,
    threads: collections.threads.length,
    tasks: collections.tasks.length,
    events: collections.events.length,
    fileChanges: collections.fileChanges.length,
    memory: collections.memory.length,
    guidance: collections.guidance.length,
    actions: collections.actions.length
  };
}

function getProjectLastActivityAt(
  project: Project,
  collections: ReturnType<typeof getProjectScopedCollections>
): string | null {
  const timestamps = [
    project.updatedAt,
    ...collections.sessions.map((item) => item.updatedAt),
    ...collections.threads.map((item) => item.updatedAt),
    ...collections.tasks.map((item) => item.updatedAt),
    ...collections.events.map((item) => item.timestamp),
    ...collections.fileChanges.map((item) => item.updatedAt),
    ...collections.memory.map((item) => item.updatedAt),
    ...collections.guidance.map((item) => item.updatedAt),
    ...collections.actions.map((item) => item.updatedAt)
  ].filter(Boolean);

  return timestamps.sort((left, right) => compareDescending(left, right))[0] ?? null;
}

function createExternalProjectSummary(
  snapshot: SubMindStoreSnapshot,
  project: Project
): ExternalProjectSummary {
  const collections = getProjectScopedCollections(snapshot, project.id);

  return {
    kind: "ExternalProjectSummary",
    project,
    counts: getProjectCollectionCounts(collections),
    lastActivityAt: getProjectLastActivityAt(project, collections)
  };
}

function getProjectSearchLimit(limit: number | undefined): number {
  if (!limit || limit <= 0) {
    return 25;
  }

  return Math.min(Math.trunc(limit), 100);
}

export function searchProjects(
  snapshot: SubMindStoreSnapshot,
  input: ProjectSearchInput = {}
): ExternalProjectSummary[] {
  const results = snapshot.projects
    .filter((project) => projectMatchesSearchQuery(project, input.query))
    .slice(0, getProjectSearchLimit(input.limit))
    .map((project) => createExternalProjectSummary(snapshot, project));

  return redactSensitiveObject(results);
}

export function createProjectExternalExport(
  snapshot: SubMindStoreSnapshot,
  projectId: string,
  generatedAt = new Date().toISOString()
): ExternalProjectExport | null {
  const project = getProjectById(snapshot, projectId);

  if (!project) {
    return null;
  }

  const collections = getProjectScopedCollections(snapshot, project.id);

  return redactSensitiveObject({
    kind: "ExternalProjectExport",
    apiVersion: subMindExternalApiVersion,
    generatedAt,
    access: {
      mode: "read_only",
      auth: "bearer_token",
      localOnly: true
    },
    project,
    counts: getProjectCollectionCounts(collections),
    ...collections
  });
}

export function resolveProjectExternalExport(
  snapshot: SubMindStoreSnapshot,
  input: ProjectExportQueryInput
): ExternalProjectExport | null {
  if (input.projectId) {
    return createProjectExternalExport(
      snapshot,
      input.projectId,
      input.generatedAt
    );
  }

  const query = input.query?.trim();

  if (!query) {
    return null;
  }

  const normalizedQuery = normalizeProjectSearchValue(query);
  const directProject = snapshot.projects.find((project) => {
    const normalizedWorkspace = normalizeProjectSearchValue(
      project.workspacePath ?? ""
    );

    return (
      normalizeProjectSearchValue(project.id) === normalizedQuery ||
      normalizeProjectSearchValue(project.name) === normalizedQuery ||
      (!!normalizedWorkspace && normalizedWorkspace === normalizedQuery)
    );
  });
  const matchedProject =
    directProject ?? searchProjects(snapshot, { query, limit: 1 })[0]?.project;

  return matchedProject
    ? createProjectExternalExport(snapshot, matchedProject.id, input.generatedAt)
    : null;
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
  return queryFileChangeHistoryFromSnapshot(snapshot, { projectId });
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
      workspacePath: "C:/Workspace/SubMind",
      repositoryRemote: "git@github.com:example/SubMind.git",
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
      workspacePath: "C:/Workspace/AtlasOps",
      repositoryRemote: "git@github.com:example/AtlasOps.git",
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
      workspacePath: "C:/Workspace/MemoryLedger",
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
      curationState: "confirmed",
      sourceEventIds: ["event-submind-schema"],
      sourceFileChangeIds: [],
      linkedActionItemIds: ["action-submind-schema"],
      linkedGuidanceItemIds: ["guidance-submind-stack"],
      changeSummary:
        "Confirmed after schema realignment planning hardened the shell boundary.",
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
      curationState: "confirmed",
      sourceEventIds: ["event-submind-shell", "event-submind-schema"],
      sourceFileChangeIds: ["change-main", "change-shell"],
      linkedActionItemIds: ["action-submind-schema"],
      linkedGuidanceItemIds: ["guidance-submind-stack"],
      changeSummary:
        "React shell migration reinforced the thin-desktop architecture rule.",
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
      curationState: "derived",
      sourceEventIds: ["event-atlas-guidance", "event-atlas-action"],
      sourceFileChangeIds: [],
      linkedActionItemIds: ["action-atlas-escalation"],
      linkedGuidanceItemIds: ["guidance-atlas-drift"],
      changeSummary:
        "Atlas drift review kept this escalation gotcha active.",
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
      curationState: "edited",
      sourceEventIds: ["event-ledger-memory"],
      sourceFileChangeIds: [],
      linkedActionItemIds: ["action-ledger-review"],
      linkedGuidanceItemIds: ["guidance-ledger-refresh"],
      changeSummary:
        "Freshness dropped and the note now waits on explicit operator confirmation.",
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
      confidence: 0.94,
      evidenceSummary:
        "2 events / 2 file changes / 2 linked memories / 1 related action",
      policySummary:
        "Schema and shell migrations stay in injected posture while architectural drift could lock in the wrong foundation.",
      linkedMemoryItemIds: ["memory-global-shell", "memory-submind-architecture"],
      linkedEventIds: ["event-submind-shell", "event-submind-schema"],
      linkedActionItemIds: ["action-submind-schema"],
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
      confidence: 0.81,
      evidenceSummary:
        "2 trace events / 1 linked memory / 1 related action around drift review",
      policySummary:
        "Keep Atlas guidance candidate-level until operator approval resolves the escalation threshold question.",
      linkedMemoryItemIds: ["memory-atlas-risk"],
      linkedEventIds: ["event-atlas-guidance", "event-atlas-action"],
      linkedActionItemIds: ["action-atlas-escalation"],
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
      confidence: 0.69,
      evidenceSummary:
        "1 memory refresh event / 1 linked memory / 1 related action awaiting review",
      policySummary:
        "Stale architecture knowledge should stay suggested until an operator confirms or supersedes it.",
      linkedMemoryItemIds: ["memory-ledger-constraints"],
      linkedEventIds: ["event-ledger-memory"],
      linkedActionItemIds: ["action-ledger-review"],
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

export {
  createSqliteCheckpointTriggerQueue,
  type CheckpointTriggerQueueStore,
  type PersistedCheckpointTrigger,
  type PersistedCheckpointTriggerScope
} from "./checkpoint-trigger-queue.js";

export {
  createSqliteRepository,
  subMindSqliteDatabasePath,
  syncRuntimeSnapshotIntoDatabase
} from "./sqlite-repository.js";
