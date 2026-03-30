import {
  queryOptions,
  useQuery,
  type UseQueryResult
} from "@tanstack/react-query";
import {
  createPreviewRepository,
  getPrimarySessionTask,
  getPrimarySessionThread,
  getProjectActionItems,
  getProjectById,
  getProjectEvents,
  getProjectFileChanges,
  getProjectGuidanceItems,
  getProjectMemoryItems,
  getProjectSessions,
  getSessionTasks,
  getSessionThreads,
  type SubMindRepository,
  type SubMindStoreSnapshot
} from "@submind/store";
import type {
  ActionItem,
  GuidanceItem,
  MemoryItem,
  Project,
  ProjectStackState,
  Session
} from "@submind/shared-schemas";
import { create } from "zustand";

export const layoutModes = ["operator", "focus", "tab"] as const;
export const primaryScreens = [
  "dashboard",
  "sessions",
  "memory",
  "guidance",
  "actions"
] as const;

export type LayoutMode = (typeof layoutModes)[number];
export type PrimaryScreen = (typeof primaryScreens)[number];
export type AppScope = "global" | "project";

export interface ShellUiState {
  layoutMode: LayoutMode;
  primaryScreen: PrimaryScreen;
  selectedProjectId: string | null;
  focusedProjectId: string | null;
  activeSessionId: string | null;
  activeMemoryId: string | null;
  activeGuidanceId: string | null;
  activeActionId: string | null;
}

export interface MetricItem {
  label: string;
  value: string;
}

export interface ToggleItem<T extends string> {
  id: T;
  label: string;
  isActive: boolean;
}

export interface ShellCardModel {
  id: string;
  label: string;
  title: string;
  body: string;
  tone: "plum" | "violet" | "slate" | "amber";
}

export interface ProjectStackCardModel {
  projectId: string;
  name: string;
  description: string;
  summary: string;
  descriptors: string[];
  state: ProjectStackState;
  sessionCount: number;
  guidanceCount: number;
  actionCount: number;
  lastTouchedLabel: string;
}

export interface SessionListItemModel {
  sessionId: string;
  projectId: string;
  projectName: string;
  title: string;
  summary: string;
  status: Session["status"];
  threadCount: number;
  taskSummary: string;
  lastTouchedLabel: string;
  isActive: boolean;
  isEmphasized: boolean;
}

export interface TraceEventItemModel {
  eventId: string;
  projectName: string;
  summary: string;
  category: string;
  nodeCategory: string;
  timestampLabel: string;
  isEmphasized: boolean;
}

export interface MemoryCardModel {
  memoryId: string;
  summary: string;
  bucket: string;
  status: string;
  projectName: string;
  confidenceLabel: string;
  freshnessLabel: string;
  isPinned: boolean;
  isActive: boolean;
  isEmphasized: boolean;
}

export interface GuidanceCardModel {
  guidanceId: string;
  title: string;
  summary: string;
  state: GuidanceItem["state"];
  source: GuidanceItem["source"];
  projectName: string;
  isActive: boolean;
  isEmphasized: boolean;
}

export interface ActionCardModel {
  actionId: string;
  title: string;
  summary: string;
  state: ActionItem["state"];
  riskLevel: ActionItem["riskLevel"];
  projectName: string;
  isActive: boolean;
  isEmphasized: boolean;
}

export interface SubMindShellViewModel {
  layoutMode: LayoutMode;
  primaryScreen: PrimaryScreen;
  scope: AppScope;
  activeProject: Project | null;
  commandStrip: {
    title: string;
    subtitle: string;
    metrics: MetricItem[];
    layoutModes: ToggleItem<LayoutMode>[];
    canFocusSelectedProject: boolean;
    canClearSelection: boolean;
    canClearFocus: boolean;
  };
  projectStack: {
    title: string;
    body: string;
    cards: ProjectStackCardModel[];
    focusedContextCards: ShellCardModel[];
  };
  contentHeader: {
    eyebrow: string;
    title: string;
    description: string;
    screens: ToggleItem<PrimaryScreen>[];
  };
  dashboard: {
    recentActivity: ShellCardModel;
    needsAttention: ShellCardModel;
    deepeningCards: ShellCardModel[];
  };
  sessions: {
    title: string;
    body: string;
    sessions: SessionListItemModel[];
    traceItems: TraceEventItemModel[];
    inspector: ShellCardModel;
  };
  memory: {
    title: string;
    body: string;
    cards: MemoryCardModel[];
    inspector: ShellCardModel;
  };
  guidance: {
    title: string;
    body: string;
    cards: GuidanceCardModel[];
    inspector: ShellCardModel;
  };
  actions: {
    title: string;
    body: string;
    cards: ActionCardModel[];
    inspector: ShellCardModel;
  };
}

export interface ShellStore extends ShellUiState {
  setLayoutMode: (layoutMode: LayoutMode) => void;
  setPrimaryScreen: (primaryScreen: PrimaryScreen) => void;
  selectProject: (projectId: string) => void;
  focusSelectedProject: () => void;
  toggleProjectFocus: (projectId: string) => void;
  clearProjectSelection: () => void;
  clearProjectFocus: () => void;
  selectSession: (sessionId: string) => void;
  selectMemory: (memoryId: string) => void;
  selectGuidance: (guidanceId: string) => void;
  selectAction: (actionId: string) => void;
  initializeFromSnapshot: (snapshot: SubMindStoreSnapshot) => void;
}

const shellQueryKey = ["submind", "snapshot"] as const;
const defaultPreviewRepository = createPreviewRepository();

function formatTimestampLabel(timestamp: string | undefined): string {
  if (!timestamp) {
    return "Pending";
  }

  return timestamp.slice(0, 16).replace("T", " ");
}

function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function resetEntitySelections(state: ShellUiState): ShellUiState {
  return {
    ...state,
    activeSessionId: null,
    activeMemoryId: null,
    activeGuidanceId: null,
    activeActionId: null
  };
}

function withProjectSelection(
  state: ShellUiState,
  selectedProjectId: string | null,
  focusedProjectId: string | null
): ShellUiState {
  return {
    ...resetEntitySelections(state),
    selectedProjectId,
    focusedProjectId
  };
}

export function createInitialShellUiState(
  snapshot: SubMindStoreSnapshot
): ShellUiState {
  return {
    layoutMode: "operator",
    primaryScreen: "dashboard",
    selectedProjectId:
      snapshot.profiles[0]?.defaultProjectId ?? snapshot.projects[0]?.id ?? null,
    focusedProjectId: null,
    activeSessionId: null,
    activeMemoryId: null,
    activeGuidanceId: null,
    activeActionId: null
  };
}

export function getShellScope(state: ShellUiState): AppScope {
  return state.focusedProjectId ? "project" : "global";
}

export function getActiveProjectId(state: ShellUiState): string | null {
  return state.focusedProjectId ?? state.selectedProjectId;
}

export function getProjectCardState(
  state: ShellUiState,
  projectId: string
): ProjectStackState {
  if (state.focusedProjectId === projectId) {
    return "focused";
  }

  if (state.selectedProjectId === projectId) {
    return "selected";
  }

  return "unselected";
}

export function setShellLayoutMode(
  state: ShellUiState,
  layoutMode: LayoutMode
): ShellUiState {
  return {
    ...state,
    layoutMode
  };
}

export function setShellPrimaryScreen(
  state: ShellUiState,
  primaryScreen: PrimaryScreen
): ShellUiState {
  return {
    ...state,
    primaryScreen
  };
}

export function selectShellProject(
  state: ShellUiState,
  projectId: string
): ShellUiState {
  if (
    state.selectedProjectId === projectId &&
    state.focusedProjectId === null
  ) {
    return withProjectSelection(state, null, null);
  }

  if (state.focusedProjectId === projectId) {
    return withProjectSelection(state, null, null);
  }

  return withProjectSelection(state, projectId, null);
}

export function focusSelectedShellProject(state: ShellUiState): ShellUiState {
  if (!state.selectedProjectId) {
    return state;
  }

  return withProjectSelection(
    state,
    state.selectedProjectId,
    state.selectedProjectId
  );
}

export function toggleShellProjectFocus(
  state: ShellUiState,
  projectId: string
): ShellUiState {
  if (state.focusedProjectId === projectId) {
    return withProjectSelection(state, projectId, null);
  }

  return withProjectSelection(state, projectId, projectId);
}

export function clearShellProjectSelection(state: ShellUiState): ShellUiState {
  return withProjectSelection(state, null, null);
}

export function clearFocusedShellProject(state: ShellUiState): ShellUiState {
  if (!state.focusedProjectId) {
    return state;
  }

  return withProjectSelection(state, state.focusedProjectId, null);
}

export function selectShellSession(
  state: ShellUiState,
  sessionId: string
): ShellUiState {
  return {
    ...state,
    activeSessionId: state.activeSessionId === sessionId ? null : sessionId
  };
}

export function selectShellMemory(
  state: ShellUiState,
  memoryId: string
): ShellUiState {
  return {
    ...state,
    activeMemoryId: state.activeMemoryId === memoryId ? null : memoryId
  };
}

export function selectShellGuidance(
  state: ShellUiState,
  guidanceId: string
): ShellUiState {
  return {
    ...state,
    activeGuidanceId: state.activeGuidanceId === guidanceId ? null : guidanceId
  };
}

export function selectShellAction(
  state: ShellUiState,
  actionId: string
): ShellUiState {
  return {
    ...state,
    activeActionId: state.activeActionId === actionId ? null : actionId
  };
}

export const useShellStore = create<ShellStore>((set) => ({
  layoutMode: "operator",
  primaryScreen: "dashboard",
  selectedProjectId: null,
  focusedProjectId: null,
  activeSessionId: null,
  activeMemoryId: null,
  activeGuidanceId: null,
  activeActionId: null,
  setLayoutMode: (layoutMode) => set((state) => setShellLayoutMode(state, layoutMode)),
  setPrimaryScreen: (primaryScreen) =>
    set((state) => setShellPrimaryScreen(state, primaryScreen)),
  selectProject: (projectId) => set((state) => selectShellProject(state, projectId)),
  focusSelectedProject: () => set((state) => focusSelectedShellProject(state)),
  toggleProjectFocus: (projectId) =>
    set((state) => toggleShellProjectFocus(state, projectId)),
  clearProjectSelection: () => set((state) => clearShellProjectSelection(state)),
  clearProjectFocus: () => set((state) => clearFocusedShellProject(state)),
  selectSession: (sessionId) => set((state) => selectShellSession(state, sessionId)),
  selectMemory: (memoryId) => set((state) => selectShellMemory(state, memoryId)),
  selectGuidance: (guidanceId) =>
    set((state) => selectShellGuidance(state, guidanceId)),
  selectAction: (actionId) => set((state) => selectShellAction(state, actionId)),
  initializeFromSnapshot: (snapshot) => set((state) => {
    if (state.selectedProjectId || state.focusedProjectId) {
      return state;
    }

    return {
      ...state,
      ...createInitialShellUiState(snapshot)
    };
  })
}));

export function createShellSnapshotQueryOptions(repository: SubMindRepository) {
  return queryOptions({
    queryKey: shellQueryKey,
    queryFn: () => repository.getSnapshot(),
    staleTime: Infinity
  });
}

export function useShellSnapshotQuery(
  repository: SubMindRepository = defaultPreviewRepository
): UseQueryResult<SubMindStoreSnapshot> {
  return useQuery(createShellSnapshotQueryOptions(repository));
}

function resolveProjectPool(
  snapshot: SubMindStoreSnapshot,
  activeProject: Project | null
): Project[] {
  if (!activeProject) {
    return snapshot.projects;
  }

  return [
    activeProject,
    ...snapshot.projects.filter((project) => project.id !== activeProject.id)
  ];
}

function resolveSessionPool(
  snapshot: SubMindStoreSnapshot,
  activeProject: Project | null
): Session[] {
  if (!activeProject) {
    return [...snapshot.sessions].sort((left, right) =>
      compareStrings(right.updatedAt, left.updatedAt)
    );
  }

  return [
    ...getProjectSessions(snapshot, activeProject.id),
    ...snapshot.sessions.filter((session) => session.projectId !== activeProject.id)
  ];
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function createCard(
  id: string,
  label: string,
  title: string,
  body: string,
  tone: ShellCardModel["tone"]
): ShellCardModel {
  return {
    id,
    label,
    title,
    body,
    tone
  };
}

function createProjectStackCards(
  snapshot: SubMindStoreSnapshot,
  state: ShellUiState,
  activeProject: Project | null
): ProjectStackCardModel[] {
  return resolveProjectPool(snapshot, activeProject).map((project) => ({
    projectId: project.id,
    name: project.name,
    description: project.description ?? "Project",
    summary: project.summary ?? "Project summary pending.",
    descriptors: project.descriptors,
    state: getProjectCardState(state, project.id),
    sessionCount: getProjectSessions(snapshot, project.id).length,
    guidanceCount: getProjectGuidanceItems(snapshot, project.id).length,
    actionCount: getProjectActionItems(snapshot, project.id).length,
    lastTouchedLabel: formatTimestampLabel(project.updatedAt)
  }));
}

function createFocusedContextCards(
  snapshot: SubMindStoreSnapshot,
  activeProject: Project | null,
  state: ShellUiState
): ShellCardModel[] {
  if (!activeProject || getShellScope(state) !== "project") {
    return [];
  }

  const actions = getProjectActionItems(snapshot, activeProject.id);
  const guidance = getProjectGuidanceItems(snapshot, activeProject.id);

  return [
    createCard(
      "project-pulse",
      "Project Pulse",
      `${actions.length} actions / ${guidance.length} guidance`,
      "Focused scope compresses the stack and promotes live project control into the main content area.",
      "plum"
    ),
    createCard(
      "project-context",
      "Project Context",
      activeProject.name,
      activeProject.summary ?? "Project context is still being composed.",
      "slate"
    )
  ];
}

function createDashboardView(
  snapshot: SubMindStoreSnapshot,
  state: ShellUiState,
  activeProject: Project | null
): SubMindShellViewModel["dashboard"] {
  const scope = getShellScope(state);
  const events = activeProject
    ? getProjectEvents(snapshot, activeProject.id)
    : [...snapshot.events].sort((left, right) => compareStrings(right.timestamp, left.timestamp));
  const actions = activeProject
    ? getProjectActionItems(snapshot, activeProject.id)
    : [...snapshot.actions];
  const guidance = activeProject
    ? getProjectGuidanceItems(snapshot, activeProject.id)
    : [...snapshot.guidance];
  const memory = activeProject
    ? getProjectMemoryItems(snapshot, activeProject.id)
    : getProjectMemoryItems(snapshot, null);
  const leadEvent = events[0];
  const leadAction = actions[0];
  const leadGuidance = guidance[0];
  const leadMemory = memory[0];

  return {
    recentActivity: createCard(
      "dashboard-activity",
      "Recent Activity",
      leadEvent?.summary ?? "No recent activity",
      scope === "project"
        ? "Focused scope keeps the active project’s work trace, file changes, and current session at the center."
        : "Global scope keeps cross-project motion visible while selection magnetizes the active project.",
      "violet"
    ),
    needsAttention: createCard(
      "dashboard-attention",
      "Needs Attention",
      leadAction?.title ?? "No urgent actions",
      leadAction?.riskSummary ??
        "Action pressure is currently low across the active surface.",
      leadAction ? "amber" : "slate"
    ),
    deepeningCards: [
      createCard(
        "dashboard-session",
        "Recent Session",
        getProjectSessions(snapshot, activeProject?.id ?? "project-submind")[0]?.summary ??
          "Session detail will appear once a project is active.",
        "Dashboard lower deepening is the story engine: recent session shape, context, and likely next move.",
        "plum"
      ),
      createCard(
        "dashboard-guidance",
        "Guidance Snapshot",
        leadGuidance?.title ?? "No guidance selected",
        leadGuidance?.summary ??
          "Guidance remains quiet until new context or risk shifts the intervention posture.",
        "violet"
      ),
      createCard(
        "dashboard-memory",
        "Architecture / Memory",
        leadMemory?.summary ?? "No pinned memory",
        leadMemory?.content ??
          "Project context and architectural reminders surface here when memory items are available.",
        "slate"
      )
    ]
  };
}

function createSessionsView(
  snapshot: SubMindStoreSnapshot,
  state: ShellUiState,
  activeProject: Project | null
): SubMindShellViewModel["sessions"] {
  const sessions = resolveSessionPool(snapshot, activeProject).map((session) => {
    const project = getProjectById(snapshot, session.projectId);
    const threads = getSessionThreads(snapshot, session.id);
    const tasks = getSessionTasks(snapshot, session.id);

    return {
      sessionId: session.id,
      projectId: session.projectId,
      projectName: project?.name ?? "Unknown project",
      title: threads[0]?.title ?? session.summary ?? "Session",
      summary: session.summary ?? "Session summary pending.",
      status: session.status,
      threadCount: threads.length,
      taskSummary:
        tasks[0]?.title ?? `${pluralize(tasks.length, "task")} tracked`,
      lastTouchedLabel: formatTimestampLabel(session.updatedAt),
      isActive: state.activeSessionId === session.id,
      isEmphasized: activeProject?.id === session.projectId
    };
  });

  const activeSession =
    sessions.find((session) => session.sessionId === state.activeSessionId) ??
    sessions[0];

  const traceItems = (activeProject
    ? [
        ...getProjectEvents(snapshot, activeProject.id),
        ...snapshot.events.filter((event) => event.projectId !== activeProject.id)
      ]
    : [...snapshot.events]
  ).map((event) => ({
    eventId: event.id,
    projectName: getProjectById(snapshot, event.projectId)?.name ?? "Unknown project",
    summary: event.summary,
    category: event.category,
    nodeCategory: event.nodeCategory,
    timestampLabel: formatTimestampLabel(event.timestamp),
    isEmphasized: activeProject?.id === event.projectId
  }));

  const activeSessionRecord = activeSession
    ? snapshot.sessions.find((session) => session.id === activeSession.sessionId) ?? null
    : null;

  return {
    title: "Sessions / Activity / Work Trace",
    body:
      "Session-first observability with thread and task context underneath the currently active scope.",
    sessions,
    traceItems,
    inspector: createCard(
      "sessions-inspector",
      "Context Inspector",
      activeSession?.title ?? "Select a session",
      activeSessionRecord
        ? `${activeSessionRecord.summary ?? "No summary."} Primary task: ${
            getPrimarySessionTask(snapshot, activeSessionRecord.id)?.title ??
            "No current task"
          }.`
        : "Choose a session to inspect its thread, task, and work-trace posture.",
      "plum"
    )
  };
}

function createMemoryView(
  snapshot: SubMindStoreSnapshot,
  state: ShellUiState,
  activeProject: Project | null
): SubMindShellViewModel["memory"] {
  const memoryPool = activeProject
    ? [
        ...getProjectMemoryItems(snapshot, activeProject.id),
        ...getProjectMemoryItems(snapshot, null)
      ]
    : [
        ...getProjectMemoryItems(snapshot, null),
        ...snapshot.memory.filter((memoryItem) => memoryItem.projectId)
      ];

  const cards = memoryPool.map((memoryItem) => ({
    memoryId: memoryItem.id,
    summary: memoryItem.summary,
    bucket: memoryItem.bucket.replaceAll("_", " "),
    status: memoryItem.status,
    projectName:
      getProjectById(snapshot, memoryItem.projectId ?? "")?.name ?? "Global",
    confidenceLabel: `${Math.round(memoryItem.confidence * 100)}% confidence`,
    freshnessLabel: `${Math.round(memoryItem.freshness * 100)}% fresh`,
    isPinned: memoryItem.isPinned,
    isActive: state.activeMemoryId === memoryItem.id,
    isEmphasized: activeProject?.id === memoryItem.projectId
  }));

  const activeMemory =
    memoryPool.find((memoryItem) => memoryItem.id === state.activeMemoryId) ??
    memoryPool[0];

  return {
    title: "Memory",
    body:
      "Structured archive with bucket, confidence, freshness, and provenance signals kept close to active work.",
    cards,
    inspector: createCard(
      "memory-inspector",
      "Memory Inspector",
      activeMemory?.summary ?? "Select a memory item",
      activeMemory?.content ??
        "Choose a memory card to inspect its evidence-weighted content and freshness cues.",
      activeMemory?.status === "stale" ? "amber" : "slate"
    )
  };
}

function createGuidanceView(
  snapshot: SubMindStoreSnapshot,
  state: ShellUiState,
  activeProject: Project | null
): SubMindShellViewModel["guidance"] {
  const guidancePool = activeProject
    ? [
        ...getProjectGuidanceItems(snapshot, activeProject.id),
        ...snapshot.guidance.filter((guidanceItem) => guidanceItem.projectId !== activeProject.id)
      ]
    : [...snapshot.guidance];

  const cards = guidancePool.map((guidanceItem) => ({
    guidanceId: guidanceItem.id,
    title: guidanceItem.title,
    summary: guidanceItem.summary,
    state: guidanceItem.state,
    source: guidanceItem.source,
    projectName: getProjectById(snapshot, guidanceItem.projectId)?.name ?? "Unknown project",
    isActive: state.activeGuidanceId === guidanceItem.id,
    isEmphasized: activeProject?.id === guidanceItem.projectId
  }));

  const activeGuidance =
    guidancePool.find((guidanceItem) => guidanceItem.id === state.activeGuidanceId) ??
    guidancePool[0];

  return {
    title: "Guidance",
    body:
      "Transparent intervention surface showing what got injected, what stayed candidate, and why.",
    cards,
    inspector: createCard(
      "guidance-inspector",
      "Decision Inspector",
      activeGuidance?.title ?? "Select guidance",
      activeGuidance
        ? `${activeGuidance.summary} ${activeGuidance.rationale}`
        : "Choose a guidance package to inspect its rationale and source posture.",
      activeGuidance?.state === "injected" ? "plum" : "violet"
    )
  };
}

function createActionsView(
  snapshot: SubMindStoreSnapshot,
  state: ShellUiState,
  activeProject: Project | null
): SubMindShellViewModel["actions"] {
  const actionsPool = activeProject
    ? [
        ...getProjectActionItems(snapshot, activeProject.id),
        ...snapshot.actions.filter((actionItem) => actionItem.projectId !== activeProject.id)
      ]
    : [...snapshot.actions];

  const cards = actionsPool.map((actionItem) => ({
    actionId: actionItem.id,
    title: actionItem.title,
    summary: actionItem.summary ?? actionItem.riskSummary,
    state: actionItem.state,
    riskLevel: actionItem.riskLevel,
    projectName: getProjectById(snapshot, actionItem.projectId)?.name ?? "Unknown project",
    isActive: state.activeActionId === actionItem.id,
    isEmphasized: activeProject?.id === actionItem.projectId
  }));

  const activeAction =
    actionsPool.find((actionItem) => actionItem.id === state.activeActionId) ??
    actionsPool[0];

  return {
    title: "Actions",
    body:
      "Inbox and approval surface with state, risk, expected outcome, and audit context kept explicit.",
    cards,
    inspector: createCard(
      "action-inspector",
      "Audit / Context Inspector",
      activeAction?.title ?? "Select an action",
      activeAction
        ? `${activeAction.riskSummary} Expected outcome: ${
            activeAction.expectedOutcome ?? "No expected outcome recorded."
          }`
        : "Choose an action to inspect its risk, outcome intent, and related work context.",
      activeAction?.riskLevel === "high" ? "amber" : "slate"
    )
  };
}

export function createShellViewModel(
  snapshot: SubMindStoreSnapshot,
  state: ShellUiState
): SubMindShellViewModel {
  const activeProject = getProjectById(snapshot, getActiveProjectId(state) ?? "");
  const scope = getShellScope(state);
  const projectStackCards = createProjectStackCards(
    snapshot,
    state,
    activeProject
  );

  return {
    layoutMode: state.layoutMode,
    primaryScreen: state.primaryScreen,
    scope,
    activeProject,
    commandStrip: {
      title: "SubMind",
      subtitle:
        scope === "project"
          ? "Project-focused operator console with persistent work trace, memory, guidance, and action control."
          : "Global operator console with project-aware magnetism and explicit focus control.",
      metrics: [
        { label: "Scope", value: scope === "project" ? "project-focused" : "global" },
        { label: "Projects", value: String(snapshot.projects.length) },
        { label: "Screen", value: state.primaryScreen },
        { label: "Active", value: activeProject?.name ?? "none" }
      ],
      layoutModes: layoutModes.map((layoutMode) => ({
        id: layoutMode,
        label: layoutMode,
        isActive: state.layoutMode === layoutMode
      })),
      canFocusSelectedProject:
        !!state.selectedProjectId && state.focusedProjectId === null,
      canClearSelection:
        state.selectedProjectId !== null || state.focusedProjectId !== null,
      canClearFocus: state.focusedProjectId !== null
    },
    projectStack: {
      title: activeProject?.name ?? "Project Stack",
      body:
        activeProject?.summary ??
        "Single click selects a project, clicking it again clears it, and double click focuses or unfocuses it.",
      cards: projectStackCards,
      focusedContextCards: createFocusedContextCards(snapshot, activeProject, state)
    },
    contentHeader: {
      eyebrow:
        scope === "project"
          ? `${activeProject?.name ?? "Project"} / project-focused`
          : activeProject
            ? `${activeProject.name} / global selection`
            : "Global Dashboard",
      title: {
        dashboard: "Dashboard",
        sessions: "Sessions",
        memory: "Memory",
        guidance: "Guidance",
        actions: "Actions"
      }[state.primaryScreen],
      description:
        activeProject && scope === "global"
          ? "Global context stays visible, but the selected project gets a stronger center of gravity."
          : scope === "project"
            ? "Main content is narrowed to the focused project while the stack remains visible."
            : "Cross-project command center with no single project dominating the main content area.",
      screens: primaryScreens.map((screen) => ({
        id: screen,
        label: screen,
        isActive: state.primaryScreen === screen
      }))
    },
    dashboard: createDashboardView(snapshot, state, activeProject),
    sessions: createSessionsView(snapshot, state, activeProject),
    memory: createMemoryView(snapshot, state, activeProject),
    guidance: createGuidanceView(snapshot, state, activeProject),
    actions: createActionsView(snapshot, state, activeProject)
  };
}
