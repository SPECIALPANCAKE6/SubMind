import {
  queryOptions,
  useQuery,
  type UseQueryResult
} from "@tanstack/react-query";
import {
  createPreviewRepository,
  getPrimarySessionTask,
  getProjectActionItems,
  getProjectById,
  getProjectEvents,
  getProjectFileChanges,
  getProjectGuidanceItems,
  getProjectMemoryItems,
  getProjectSessions,
  getSessionTasks,
  getSessionThreads,
  projectMatchesSearchQuery,
  type SubMindRepository,
  type SubMindStoreSnapshot
} from "@submind/store";
import {
  createActionCheckpointSummary,
  createGuidanceCheckpointSummary
} from "@submind/workers";
import { redactSensitiveObject } from "@submind/policy";
import type {
  ActionItem,
  Event,
  FileChange,
  GuidanceItem,
  MemoryItem,
  Project,
  ProjectStackState,
  Session,
  Task,
  Thread
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

export interface SecretRevealTarget {
  label: string;
  fingerprint: string;
}

export interface SecretProtectionModel {
  target: SecretRevealTarget | null;
  label: string;
  canReveal: boolean;
  isRevealing: boolean;
  redactionCount: number;
  kindLabels: string[];
  autoHideMs: number;
}

export interface ShellUiState {
  layoutMode: LayoutMode;
  primaryScreen: PrimaryScreen;
  selectedProjectId: string | null;
  focusedProjectId: string | null;
  projectSearchQuery: string;
  secretRevealTarget: SecretRevealTarget | null;
  activeSessionId: string | null;
  activeThreadId: string | null;
  activeMemoryId: string | null;
  activeGuidanceId: string | null;
  activeActionId: string | null;
}

export interface MetricItem {
  label: string;
  value: string;
  action?: {
    kind: "clear-selection" | "clear-focus";
    label: string;
    value: string;
  };
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
  facts?: string[];
  details?: Array<{
    label: string;
    value: string;
  }>;
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

export interface SessionThreadItemModel {
  threadId: string;
  title: string;
  summary: string;
  sourceLabel: string;
  status: Thread["status"];
  updatedAtLabel: string;
  taskCount: number;
  eventCount: number;
  fileChangeCount: number;
  isActive: boolean;
}

export interface SessionTaskItemModel {
  taskId: string;
  title: string;
  summary: string;
  status: Task["status"];
  priority: Task["priority"];
  updatedAtLabel: string;
}

export interface TraceEventItemModel {
  eventId: string;
  projectName: string;
  summary: string;
  category: string;
  eventType: string;
  originLabel: string;
  nodeCategory: string;
  fileChangeLabel: string;
  timestampLabel: string;
  isEmphasized: boolean;
}

export interface SessionFileChangeItemModel {
  fileChangeId: string;
  path: string;
  changeType: FileChange["changeType"];
  summary: string;
  eventSummary: string;
  languageLabel: string;
  updatedAtLabel: string;
}

export interface SessionContextLinkModel {
  id: string;
  kind: "action" | "guidance" | "memory";
  title: string;
  summary: string;
  meta: string;
  tone: ShellCardModel["tone"];
  targetId: string;
}

export interface MemoryCardModel {
  memoryId: string;
  summary: string;
  bucket: string;
  status: string;
  projectName: string;
  confidenceLabel: string;
  freshnessLabel: string;
  curationLabel: string;
  provenanceLabel: string;
  changeLabel: string;
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
  confidenceLabel: string;
  evidenceLabel: string;
  policyLabel: string;
  linkedMemoryLabel: string;
  actionPressureLabel: string;
  isActive: boolean;
  isEmphasized: boolean;
}

export interface RetainedHistoryItemModel {
  eventId: string;
  summary: string;
  timestampLabel: string;
  originLabel: string;
  metaLabel: string;
  isLatest: boolean;
}

export interface MemoryInspectorModel {
  memoryId: string | null;
  title: string;
  content: string;
  projectName: string;
  bucketLabel: string;
  statusLabel: string;
  confidenceLabel: string;
  freshnessLabel: string;
  curationLabel: string;
  provenanceSummary: string;
  changeSummary: string;
  linkedContext: SessionContextLinkModel[];
  sourceEvents: TraceEventItemModel[];
  sourceFiles: SessionFileChangeItemModel[];
  historyItems: RetainedHistoryItemModel[];
  isPinned: boolean;
}

export interface GuidanceInspectorModel {
  guidanceId: string | null;
  title: string;
  summary: string;
  rationale: string;
  projectName: string;
  stateLabel: string;
  sourceLabel: string;
  confidenceLabel: string;
  evidenceSummary: string;
  policySummary: string;
  linkedContext: SessionContextLinkModel[];
  evidenceEvents: TraceEventItemModel[];
  historyItems: RetainedHistoryItemModel[];
}

export interface ActionCardModel {
  actionId: string;
  title: string;
  summary: string;
  state: ActionItem["state"];
  riskLevel: ActionItem["riskLevel"];
  projectName: string;
  owner: ActionItem["owner"];
  contextLabel: string;
  outcomeLabel: string;
  isActive: boolean;
  isEmphasized: boolean;
}

export type ActionTransitionState = Extract<
  ActionItem["state"],
  "approved" | "rejected" | "blocked" | "resolved"
>;

export interface ActionTransitionControlModel {
  nextState: ActionTransitionState;
  label: string;
  tone: ShellCardModel["tone"];
  description: string;
  isDisabled: boolean;
}

export interface ActionHistoryItemModel {
  eventId: string;
  summary: string;
  timestampLabel: string;
  actorLabel: string;
  transitionLabel: string;
  isLatest: boolean;
}

export interface ShellViewModelOptions {
  actionOutcomeDraft?: string;
  isActionMutationPending?: boolean;
  pendingActionTransition?: ActionTransitionState | null;
  memorySummaryDraft?: string;
  memoryContentDraft?: string;
  memoryStatusDraft?: MemoryItem["status"] | "";
  memoryPinnedDraft?: boolean | null;
  isMemoryMutationPending?: boolean;
}

export interface SubMindShellViewModel {
  layoutMode: LayoutMode;
  primaryScreen: PrimaryScreen;
  scope: AppScope;
  activeProject: Project | null;
  secretProtection: SecretProtectionModel;
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
    search: {
      query: string;
      placeholder: string;
      resultLabel: string;
      filteredCount: number;
      totalCount: number;
      isFiltering: boolean;
    };
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
    activeSessionId: string | null;
    activeThreadId: string | null;
    sessions: SessionListItemModel[];
    threads: SessionThreadItemModel[];
    tasks: SessionTaskItemModel[];
    traceItems: TraceEventItemModel[];
    fileChanges: SessionFileChangeItemModel[];
    linkedContext: SessionContextLinkModel[];
    inspector: ShellCardModel;
  };
  memory: {
    title: string;
    body: string;
    cards: MemoryCardModel[];
    inspector: MemoryInspectorModel;
    draftSummary: string;
    draftContent: string;
    draftStatus: MemoryItem["status"] | "";
    draftIsPinned: boolean;
    isMutationPending: boolean;
  };
  guidance: {
    title: string;
    body: string;
    posture: ShellCardModel;
    cards: GuidanceCardModel[];
    inspector: GuidanceInspectorModel;
  };
  actions: {
    title: string;
    body: string;
    posture: ShellCardModel;
    cards: ActionCardModel[];
    activeActionId: string | null;
    mainView: ShellCardModel;
    expectedOutcome: string;
    actualOutcome: string;
    actualOutcomePlaceholder: string;
    transitionControls: ActionTransitionControlModel[];
    historyItems: ActionHistoryItemModel[];
    isMutationPending: boolean;
    pendingActionTransition: ActionTransitionState | null;
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
  setProjectSearchQuery: (query: string) => void;
  revealSecretTarget: (target: SecretRevealTarget) => void;
  hideSecretTarget: () => void;
  selectSession: (sessionId: string) => void;
  selectThread: (threadId: string) => void;
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
    secretRevealTarget: null,
    activeSessionId: null,
    activeThreadId: null,
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
    projectSearchQuery: "",
    secretRevealTarget: null,
    activeSessionId: null,
    activeThreadId: null,
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
    secretRevealTarget: null,
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

export function setShellProjectSearchQuery(
  state: ShellUiState,
  query: string
): ShellUiState {
  return {
    ...state,
    projectSearchQuery: query
  };
}

export function selectShellSession(
  state: ShellUiState,
  sessionId: string
): ShellUiState {
  return {
    ...state,
    secretRevealTarget: null,
    activeSessionId: state.activeSessionId === sessionId ? null : sessionId,
    activeThreadId: null
  };
}

export function selectShellThread(
  state: ShellUiState,
  threadId: string
): ShellUiState {
  return {
    ...state,
    secretRevealTarget: null,
    activeThreadId: state.activeThreadId === threadId ? null : threadId
  };
}

export function selectShellMemory(
  state: ShellUiState,
  memoryId: string
): ShellUiState {
  return {
    ...state,
    secretRevealTarget: null,
    activeMemoryId: state.activeMemoryId === memoryId ? null : memoryId
  };
}

export function selectShellGuidance(
  state: ShellUiState,
  guidanceId: string
): ShellUiState {
  return {
    ...state,
    secretRevealTarget: null,
    activeGuidanceId: state.activeGuidanceId === guidanceId ? null : guidanceId
  };
}

export function selectShellAction(
  state: ShellUiState,
  actionId: string
): ShellUiState {
  return {
    ...state,
    secretRevealTarget: null,
    activeActionId: state.activeActionId === actionId ? null : actionId
  };
}

export function revealShellSecretTarget(
  state: ShellUiState,
  target: SecretRevealTarget
): ShellUiState {
  return {
    ...state,
    secretRevealTarget: target
  };
}

export function hideShellSecretTarget(state: ShellUiState): ShellUiState {
  return {
    ...state,
    secretRevealTarget: null
  };
}

export const useShellStore = create<ShellStore>((set) => ({
  layoutMode: "operator",
  primaryScreen: "dashboard",
  selectedProjectId: null,
  focusedProjectId: null,
  projectSearchQuery: "",
  secretRevealTarget: null,
  activeSessionId: null,
  activeThreadId: null,
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
  setProjectSearchQuery: (query) =>
    set((state) => setShellProjectSearchQuery(state, query)),
  revealSecretTarget: (target) =>
    set((state) => revealShellSecretTarget(state, target)),
  hideSecretTarget: () => set((state) => hideShellSecretTarget(state)),
  selectSession: (sessionId) => set((state) => selectShellSession(state, sessionId)),
  selectThread: (threadId) => set((state) => selectShellThread(state, threadId)),
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

function formatTitleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function detectRuntimeThreadSource(
  events: Event[]
): "Codex" | "Copilot" | "Mixed" | null {
  const runtimeSources = new Set<"Codex" | "Copilot">();

  for (const event of events) {
    const metadataSource =
      typeof event.metadata.source === "string" ? event.metadata.source : null;

    if (metadataSource?.startsWith("codex") || event.originType === "codex") {
      runtimeSources.add("Codex");
    }

    if (
      metadataSource?.startsWith("copilot") ||
      event.eventType.startsWith("copilot_")
    ) {
      runtimeSources.add("Copilot");
    }
  }

  if (runtimeSources.size === 0) {
    return null;
  }

  if (runtimeSources.size > 1) {
    return "Mixed";
  }

  return [...runtimeSources][0] ?? null;
}

function detectDerivedThreadSource(events: Event[]): string | null {
  const meaningfulOrigin = events.find(
    (event) =>
      event.originType === "submind" || event.originType === "subagent"
  )?.originType;

  if (!meaningfulOrigin) {
    return null;
  }

  return meaningfulOrigin === "submind"
    ? "SubMind"
    : formatTitleCase(meaningfulOrigin);
}

function resolveThreadSourceLabel(
  threadEvents: Event[],
  sessionEvents: Event[]
): string {
  return (
    detectRuntimeThreadSource(threadEvents) ??
    detectRuntimeThreadSource(sessionEvents) ??
    detectDerivedThreadSource(threadEvents) ??
    detectDerivedThreadSource(sessionEvents) ??
    "Unknown"
  );
}

function createCard(
  id: string,
  label: string,
  title: string,
  body: string,
  tone: ShellCardModel["tone"],
  facts?: string[],
  details?: ShellCardModel["details"]
): ShellCardModel {
  const card: ShellCardModel = {
    id,
    label,
    title,
    body,
    tone
  };

  if (facts && facts.length > 0) {
    card.facts = facts;
  }

  if (details && details.length > 0) {
    card.details = details;
  }

  return card;
}

function compactFact(value: string | null | undefined): string | null {
  const normalized = compactDashboardText(value ?? "", 28);
  return normalized || null;
}

function buildFacts(
  ...facts: Array<string | null | undefined>
): string[] {
  return facts
    .map((fact) => compactFact(fact))
    .filter((fact): fact is string => !!fact)
    .slice(0, 4);
}

function buildDetailItems(
  ...items: Array<
    | {
        label: string;
        value: string | null | undefined;
      }
    | null
    | undefined
  >
): NonNullable<ShellCardModel["details"]> {
  return items
    .filter(
      (
        item
      ): item is {
        label: string;
        value: string | null | undefined;
      } => !!item
    )
    .map((item) => {
      const value = compactDashboardText(item.value ?? "", 84);
      return value
        ? {
            label: item.label,
            value
          }
        : null;
    })
    .filter(
      (
        item
      ): item is {
        label: string;
        value: string;
      } => !!item
    )
    .slice(0, 4);
}

function compactDashboardPath(value: string): string {
  const normalized = value.replace(/^\\\\\?\\/, "").replaceAll("\\", "/");
  const segments = normalized.split("/").filter(Boolean);

  if (segments.length <= 3) {
    return segments.join("/");
  }

  return segments.slice(-3).join("/");
}

function compactDashboardText(
  value: string | undefined,
  maxLength = 160
): string {
  const normalized = (value ?? "")
    .replace(/[A-Za-z]:[\\/][^\s)]+/g, (match) => compactDashboardPath(match))
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function formatDashboardSessionSummary(
  session: Session | null,
  threads: Thread[],
  tasks: Task[],
  events: Event[],
  fileChanges: FileChange[]
): string {
  if (!session) {
    return "Open Sessions to inspect the next work trace.";
  }

  const latestEvent = events[0];
  const latestFileChange = fileChanges[0];
  const detail = latestFileChange
    ? `${formatTitleCase(latestFileChange.changeType)} ${compactDashboardPath(
        latestFileChange.path
      )}`
    : latestEvent
      ? compactDashboardText(latestEvent.summary, 88)
      : tasks[0]
        ? compactDashboardText(tasks[0].title, 88)
        : "No recent work trace recorded.";

  return `${formatTitleCase(session.status)} session · ${pluralize(
    threads.length,
    "thread"
  )} / ${pluralize(fileChanges.length, "file change")}. Latest: ${detail}`;
}

function formatDashboardFileChangeHeadline(
  fileChange: FileChange | null | undefined
): string {
  if (!fileChange) {
    return "";
  }

  return compactDashboardText(
    `${formatTitleCase(fileChange.changeType)} ${compactDashboardPath(fileChange.path)}`,
    88
  );
}

function getDashboardLeadEvent(events: Event[]): Event | undefined {
  return (
    events.find(
      (event) =>
        event.category === "work_change" ||
        event.category === "action" ||
        event.category === "guidance" ||
        event.category === "memory"
    ) ?? events[0]
  );
}

function createProjectStackCards(
  snapshot: SubMindStoreSnapshot,
  state: ShellUiState,
  activeProject: Project | null
): ProjectStackCardModel[] {
  return resolveProjectPool(snapshot, activeProject)
    .filter((project) =>
      projectMatchesSearchQuery(project, state.projectSearchQuery)
    )
    .map((project) => ({
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
  const sessions = getProjectSessions(snapshot, activeProject.id);
  const events = getProjectEvents(snapshot, activeProject.id);
  const fileChanges = getProjectFileChanges(snapshot, activeProject.id);
  const memory = getProjectMemoryItems(snapshot, activeProject.id);
  const leadOpenAction =
    actions.find((actionItem) =>
      ["pending", "in_progress", "blocked"].includes(actionItem.state)
    ) ?? null;
  const leadGuidance =
    guidance.find((guidanceItem) => guidanceItem.state === "injected") ??
    guidance.find((guidanceItem) => guidanceItem.state === "candidate") ??
    guidance[0] ??
    null;
  const leadFileChange = fileChanges[0] ?? null;
  const leadMemory = memory.find((memoryItem) => memoryItem.isPinned) ?? memory[0] ?? null;
  const pulseTitle = leadOpenAction
    ? `${actions.filter((actionItem) =>
        ["pending", "in_progress", "blocked"].includes(actionItem.state)
      ).length} open action${actions.filter((actionItem) =>
        ["pending", "in_progress", "blocked"].includes(actionItem.state)
      ).length === 1 ? "" : "s"} / ${guidance.length} guidance`
    : fileChanges.length > 0
      ? `${pluralize(fileChanges.length, "file change")} / ${pluralize(
          events.length,
          "event"
        )}`
      : `${actions.length} actions / ${guidance.length} guidance`;
  const pulseBody = leadOpenAction
    ? `Top pressure: ${compactDashboardText(
        leadOpenAction.title,
        86
      )}. ${compactDashboardText(leadOpenAction.riskSummary, 88)}`
    : leadFileChange
      ? `Latest change: ${formatTitleCase(
          leadFileChange.changeType
        )} ${compactDashboardPath(leadFileChange.path)}. Recent trace stays narrowed here.`
      : leadGuidance
        ? `Next likely move: ${compactDashboardText(
            leadGuidance.title,
            88
          )}. ${compactDashboardText(leadGuidance.evidenceSummary, 72)}`
        : `${activeProject.name} is narrowed into a project room with live trace, retained context, and operator control held close.`;
  const contextBody = leadMemory
    ? `${compactDashboardText(leadMemory.content, 118)} ${
        leadMemory.changeSummary
          ? `Changed: ${compactDashboardText(leadMemory.changeSummary, 52)}`
          : ""
      }`.trim()
    : `${pluralize(sessions.length, "session")} / ${pluralize(
        events.length,
        "event"
      )} tracked inside ${activeProject.name}, with ${pluralize(
        fileChanges.length,
        "file change"
      )} and ${pluralize(actions.length, "action")} currently visible.`;

  return [
    createCard(
      "project-pulse",
      "Project Pulse",
      pulseTitle,
      pulseBody,
      "plum"
    ),
    createCard(
      "project-context",
      "Project Context",
      activeProject.name,
      contextBody || activeProject.summary || "Project context is still being composed.",
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
  const dashboardMode =
    scope === "project" ? "focused" : activeProject ? "selected" : "unselected";
  const actionCheckpoint = createActionCheckpointSummary(
    snapshot,
    activeProject?.id ?? null
  );
  const guidanceCheckpoint = createGuidanceCheckpointSummary(
    snapshot,
    activeProject?.id ?? null
  );
  const events = activeProject
    ? getProjectEvents(snapshot, activeProject.id)
    : [...snapshot.events].sort((left, right) => compareStrings(right.timestamp, left.timestamp));
  const fileChanges = activeProject
    ? getProjectFileChanges(snapshot, activeProject.id)
    : [...snapshot.fileChanges].sort((left, right) =>
        compareStrings(right.updatedAt, left.updatedAt)
      );
  const actions = activeProject
    ? getProjectActionItems(snapshot, activeProject.id)
    : [...snapshot.actions];
  const guidance = activeProject
    ? getProjectGuidanceItems(snapshot, activeProject.id)
    : [...snapshot.guidance];
  const memory = activeProject
    ? getProjectMemoryItems(snapshot, activeProject.id)
    : getProjectMemoryItems(snapshot, null);
  const sessionPool = resolveSessionPool(snapshot, activeProject);
  const leadSession = sessionPool[0] ?? null;
  const leadSessionThreads = leadSession
    ? getSessionThreads(snapshot, leadSession.id)
    : [];
  const leadSessionTasks = leadSession ? getSessionTasks(snapshot, leadSession.id) : [];
  const leadSessionEvents = leadSession
    ? snapshot.events
        .filter((event) => event.sessionId === leadSession.id)
        .sort((left, right) => compareStrings(right.timestamp, left.timestamp))
    : [];
  const leadSessionFileChanges = leadSession
    ? snapshot.fileChanges
        .filter((fileChange) => fileChange.sessionId === leadSession.id)
        .sort((left, right) => compareStrings(right.updatedAt, left.updatedAt))
    : [];
  const leadEvent = getDashboardLeadEvent(events);
  const leadFileChange = fileChanges[0];
  const leadAction = actions[0];
  const leadGuidance = guidance[0];
  const leadMemory = memory[0];
  const urgentAction =
    actions.find(
      (actionItem) =>
        ["pending", "in_progress", "blocked"].includes(actionItem.state) &&
        ["high", "critical"].includes(actionItem.riskLevel)
    ) ??
    actions.find((actionItem) =>
      ["pending", "in_progress", "blocked"].includes(actionItem.state)
    ) ??
    null;
  const focusedRecentActivityBody =
    leadFileChange || leadSession
      ? [
          leadFileChange
            ? `Latest change stayed inside the project room: ${compactDashboardText(
                leadFileChange.path,
                56
              )}.`
            : null,
          leadEvent && leadEvent !== leadSessionEvents[0]
            ? `Trace: ${compactDashboardText(leadEvent.summary, 64)}`
            : null
        ]
          .filter(Boolean)
          .join(" ")
      : `${activeProject?.name ?? "This project"} is now the active room, keeping work trace, file changes, and retained context at the center.`;
  const selectedRecentActivityBody = activeProject
    ? [
        `${activeProject.name} is leading the board.`,
        leadSessionEvents[0]
          ? `Trace: ${compactDashboardText(leadSessionEvents[0].summary, 66)}`
          : leadEvent
            ? `Trace: ${compactDashboardText(leadEvent.summary, 66)}`
            : null,
        "Cross-project context remains visible."
      ]
        .filter(Boolean)
        .join(" ")
    : "Global scope keeps cross-project motion visible while selection magnetizes the active project.";
  const globalRecentActivityBody = `Cross-project activity is currently tracking ${pluralize(
    snapshot.events.length,
    "event"
  )} across ${pluralize(snapshot.projects.length, "project")}.`;
  const quietAttentionBody = leadGuidance
    ? `Next likely move: ${compactDashboardText(
        leadGuidance.title,
        64
      )}. ${compactDashboardText(leadGuidance.evidenceSummary, 48)}`
    : leadSession
      ? `${dashboardMode === "focused" ? "Project-room next move" : "Next likely move"}: open Sessions and inspect the latest thread.`
      : dashboardMode === "focused"
        ? "No urgent actions are active. Stay in the project room and inspect the latest trace before context drifts."
        : "No urgent actions are active. Review the latest session trace before leaving the dashboard.";
  const quietAttentionTitle = leadGuidance
    ? compactDashboardText(leadGuidance.title, 110)
    : leadSessionFileChanges[0]
      ? `Inspect ${compactDashboardPath(leadSessionFileChanges[0].path)}`
      : dashboardMode === "focused"
        ? "Project room is clear"
        : dashboardMode === "selected" && activeProject
          ? `Review ${activeProject.name}`
          : "Monitor active projects";
  const recentSessionTitle = leadSessionFileChanges[0]
    ? formatDashboardFileChangeHeadline(leadSessionFileChanges[0])
    : leadSessionThreads[0]
      ? compactDashboardText(leadSessionThreads[0].title, 72)
      : leadSessionTasks[0]
        ? compactDashboardText(leadSessionTasks[0].title, 72)
        : "Recent session detail";
  const recentSessionBody = [
    leadSession
      ? `${formatTitleCase(leadSession.status)} session centered on ${pluralize(
          leadSessionThreads.length,
          "thread"
        )}.`
      : "Open Sessions to inspect the next work trace.",
    leadSessionEvents[0]
      ? `Trace: ${compactDashboardText(leadSessionEvents[0].summary, 86)}`
      : null
  ]
    .filter(Boolean)
    .join(" ");
  const guidanceBody = leadGuidance
    ? `${compactDashboardText(leadGuidance.summary, 82)} ${compactDashboardText(
        leadGuidance.evidenceSummary,
        58
      )}`.trim()
    : guidanceCheckpoint.recommendedBody;
  const memoryBody = leadMemory
    ? [
        compactDashboardText(leadMemory.content, 96),
        leadMemory.changeSummary
          ? `Changed: ${compactDashboardText(leadMemory.changeSummary, 44)}`
          : null
      ]
        .filter(Boolean)
        .join(" ")
    : "Project context and architectural reminders surface here when memory items are available.";
  const recentActivityFacts = buildFacts(
    leadSession ? pluralize(leadSessionThreads.length, "thread") : null,
    leadSession
      ? pluralize(leadSessionFileChanges.length, "file change")
      : pluralize(fileChanges.length, "file change"),
    leadSession
      ? pluralize(leadSessionEvents.length, "event")
      : pluralize(events.length, "event"),
    leadSession ? formatTitleCase(leadSession.status) : null
  );
  const attentionFacts = buildFacts(
    urgentAction ? `${formatTitleCase(urgentAction.riskLevel)} risk` : null,
    actionCheckpoint.openCount > 0 ? pluralize(actionCheckpoint.openCount, "open action") : null,
    leadGuidance ? pluralize(leadGuidance.linkedMemoryItemIds.length, "memory link") : null,
    leadGuidance ? pluralize(leadGuidance.linkedEventIds.length, "event") : null
  );
  const recentSessionFacts = buildFacts(
    pluralize(leadSessionThreads.length, "thread"),
    pluralize(leadSessionTasks.length, "task"),
    pluralize(leadSessionFileChanges.length, "file change"),
    leadSession ? formatTitleCase(leadSession.status) : null
  );
  const guidanceFacts = buildFacts(
    leadGuidance ? pluralize(leadGuidance.linkedMemoryItemIds.length, "memory link") : null,
    leadGuidance ? pluralize(leadGuidance.linkedEventIds.length, "event") : null,
    leadGuidance ? pluralize(leadGuidance.linkedActionItemIds.length, "action link") : null,
    leadGuidance ? formatTitleCase(leadGuidance.state) : null
  );
  const memoryFacts = buildFacts(
    leadMemory ? formatTitleCase(leadMemory.status) : null,
    leadMemory ? pluralize(leadMemory.sourceEventIds.length, "event") : null,
    leadMemory ? pluralize(leadMemory.sourceFileChangeIds.length, "file change") : null,
    leadMemory ? pluralize(leadMemory.linkedGuidanceItemIds.length, "guidance link") : null
  );
  const recentActivityDetails = buildDetailItems(
    leadSession
      ? {
          label: "Session",
          value: `${formatTitleCase(leadSession.status)} / ${pluralize(
            leadSessionThreads.length,
            "thread"
          )} / ${pluralize(leadSessionFileChanges.length, "file change")}`
        }
      : activeProject
        ? {
            label: "Scope",
            value: `${activeProject.name} / ${pluralize(
              fileChanges.length,
              "file change"
            )} / ${pluralize(events.length, "event")}`
          }
        : {
            label: "Scope",
            value: `${pluralize(snapshot.projects.length, "project")} / ${pluralize(
              events.length,
              "event"
            )}`
          },
    leadFileChange
      ? {
          label: "Latest file",
          value: `${formatTitleCase(leadFileChange.changeType)} ${compactDashboardPath(
            leadFileChange.path
          )}`
        }
      : null,
    leadSessionEvents[0]
      ? {
          label: "Latest event",
          value: leadSessionEvents[0].summary
        }
      : leadEvent
        ? {
            label: "Latest event",
            value: leadEvent.summary
          }
        : null
  );
  const attentionDetails = buildDetailItems(
    urgentAction
      ? {
          label: "Action",
          value: `${formatTitleCase(urgentAction.state)} / ${formatTitleCase(
            urgentAction.riskLevel
          )} risk / ${urgentAction.owner}`
        }
      : {
          label: "Pressure",
          value:
            actionCheckpoint.openCount > 0
              ? `${pluralize(actionCheckpoint.openCount, "open action")} still visible`
              : "No blocked or high-risk action is currently active."
        },
    leadGuidance
      ? {
          label: "Guidance",
          value: leadGuidance.title
        }
      : null,
    urgentAction
      ? {
          label: "Why now",
          value: urgentAction.riskSummary
        }
      : leadSessionEvents[0]
        ? {
            label: "Latest trace",
            value: leadSessionEvents[0].summary
          }
        : null
  );
  const recentSessionDetails = buildDetailItems(
    leadSession
      ? {
          label: "Session",
          value: `${formatTitleCase(leadSession.status)} / ${pluralize(
            leadSessionThreads.length,
            "thread"
          )} / ${pluralize(leadSessionTasks.length, "task")}`
        }
      : null,
    leadSessionThreads[0]
      ? {
          label: "Thread",
          value: leadSessionThreads[0].title
        }
      : leadSessionTasks[0]
        ? {
            label: "Task",
            value: leadSessionTasks[0].title
          }
        : null,
    leadSessionFileChanges[0]
      ? {
          label: "Latest file",
          value: `${formatTitleCase(
            leadSessionFileChanges[0].changeType
          )} ${compactDashboardPath(leadSessionFileChanges[0].path)}`
        }
      : leadSessionEvents[0]
        ? {
            label: "Latest event",
            value: leadSessionEvents[0].summary
          }
        : null
  );
  const guidanceDetails = buildDetailItems(
    leadGuidance
      ? {
          label: "State",
          value: `${formatTitleCase(leadGuidance.state)} / ${formatTitleCase(
            leadGuidance.source
          )}`
        }
      : {
          label: "Checkpoint",
          value: guidanceCheckpoint.recommendedTitle
        },
    leadGuidance
      ? {
          label: "Evidence",
          value: leadGuidance.evidenceSummary
        }
      : {
          label: "Reasoning",
          value: guidanceCheckpoint.recommendedBody
        },
    leadGuidance
      ? {
          label: "Links",
          value: `${pluralize(
            leadGuidance.linkedMemoryItemIds.length,
            "memory link"
          )} / ${pluralize(leadGuidance.linkedEventIds.length, "event")}`
        }
      : null
  );
  const memoryDetails = buildDetailItems(
    leadMemory
      ? {
          label: "Status",
          value: `${formatTitleCase(leadMemory.status)} / ${Math.round(
            leadMemory.confidence * 100
          )}% confidence`
        }
      : null,
    leadMemory
      ? {
          label: "Provenance",
          value: `${pluralize(
            leadMemory.sourceEventIds.length,
            "event"
          )} / ${pluralize(leadMemory.sourceFileChangeIds.length, "file change")}`
        }
      : null,
    leadMemory?.changeSummary
      ? {
          label: "Changed",
          value: leadMemory.changeSummary
        }
      : null
  );

  return {
    recentActivity: createCard(
      "dashboard-activity",
      "Recent Activity",
      leadFileChange
        ? formatDashboardFileChangeHeadline(leadFileChange)
        : compactDashboardText(leadEvent?.summary, 98) || "No recent activity",
      scope === "project"
        ? focusedRecentActivityBody
        : activeProject
          ? selectedRecentActivityBody
          : globalRecentActivityBody,
      "violet",
      recentActivityFacts,
      recentActivityDetails
    ),
    needsAttention: createCard(
      "dashboard-attention",
      "Needs Attention",
      urgentAction
        ? compactDashboardText(urgentAction.title, 110)
        : actionCheckpoint.openCount > 0
          ? `${actionCheckpoint.openCount} actions still open`
          : quietAttentionTitle,
      urgentAction
        ? `${compactDashboardText(
            urgentAction.riskSummary,
            140
          )} Next move: ${formatTitleCase(urgentAction.state)} action owned by ${
            urgentAction.owner
          }.`
        : quietAttentionBody,
      urgentAction ? "amber" : "slate",
      attentionFacts,
      attentionDetails
    ),
    deepeningCards: [
      createCard(
        "dashboard-session",
        "Recent Session",
        recentSessionTitle,
        recentSessionBody,
        "plum",
        recentSessionFacts,
        recentSessionDetails
      ),
      createCard(
        "dashboard-guidance",
        "Guidance Snapshot",
        leadGuidance?.title ?? guidanceCheckpoint.recommendedTitle,
        guidanceBody,
        guidanceCheckpoint.highRiskActionCount > 0 ? "amber" : "violet",
        guidanceFacts,
        guidanceDetails
      ),
      createCard(
        "dashboard-memory",
        "Architecture / Memory",
        leadMemory?.summary ?? "No pinned memory",
        memoryBody,
        "slate",
        memoryFacts,
        memoryDetails
      )
    ]
  };
}

function getActiveSessionRecord(
  snapshot: SubMindStoreSnapshot,
  state: ShellUiState,
  activeProject: Project | null
): Session | null {
  const pool = resolveSessionPool(snapshot, activeProject);

  return (
    pool.find((session) => session.id === state.activeSessionId) ??
    pool[0] ??
    null
  );
}

function getActiveSessionThreadRecord(
  snapshot: SubMindStoreSnapshot,
  state: ShellUiState,
  activeSession: Session | null
): Thread | null {
  if (!activeSession) {
    return null;
  }

  const threads = getSessionThreads(snapshot, activeSession.id);

  return (
    threads.find((thread) => thread.id === state.activeThreadId) ??
    threads[0] ??
    null
  );
}

function getSessionScopedGuidanceItems(
  snapshot: SubMindStoreSnapshot,
  session: Session | null,
  thread: Thread | null
): GuidanceItem[] {
  if (!session) {
    return [];
  }

  return snapshot.guidance.filter((guidanceItem) => {
    if (guidanceItem.projectId !== session.projectId) {
      return false;
    }

    if (thread) {
      return guidanceItem.threadId === thread.id;
    }

    return guidanceItem.sessionId === session.id;
  });
}

function getSessionScopedActionItems(
  snapshot: SubMindStoreSnapshot,
  session: Session | null,
  thread: Thread | null
): ActionItem[] {
  if (!session) {
    return [];
  }

  return snapshot.actions.filter((actionItem) => {
    if (actionItem.projectId !== session.projectId) {
      return false;
    }

    if (thread) {
      return actionItem.threadId === thread.id;
    }

    return actionItem.sessionId === session.id;
  });
}

function getSessionScopedMemoryItems(
  snapshot: SubMindStoreSnapshot,
  session: Session | null,
  thread: Thread | null,
  guidanceItems: GuidanceItem[],
  events: Event[]
): MemoryItem[] {
  if (!session) {
    return [];
  }

  const memoryIds = new Set<string>();

  for (const guidanceItem of guidanceItems) {
    for (const memoryId of guidanceItem.linkedMemoryItemIds) {
      memoryIds.add(memoryId);
    }
  }

  for (const event of events) {
    if (event.memoryItemId) {
      memoryIds.add(event.memoryItemId);
    }
  }

  const linkedMemory = snapshot.memory.filter((memoryItem) => memoryIds.has(memoryItem.id));

  if (linkedMemory.length > 0) {
    return linkedMemory;
  }

  return snapshot.memory.filter((memoryItem) => {
    if (memoryItem.projectId !== session.projectId) {
      return false;
    }

    if (thread) {
      return memoryItem.threadId === thread.id;
    }

    return memoryItem.sessionId === session.id || !memoryItem.sessionId;
  });
}

function createSessionsView(
  snapshot: SubMindStoreSnapshot,
  state: ShellUiState,
  activeProject: Project | null
): SubMindShellViewModel["sessions"] {
  const sessionPool = resolveSessionPool(snapshot, activeProject);
  const sessions = sessionPool.map((session) => {
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

  const activeSessionRecord = getActiveSessionRecord(snapshot, state, activeProject);
  const activeThreadRecord = getActiveSessionThreadRecord(
    snapshot,
    state,
    activeSessionRecord
  );
  const activeSession = activeSessionRecord
    ? sessions.find((session) => session.sessionId === activeSessionRecord.id) ?? null
    : null;
  const activeSessionThreads = activeSessionRecord
    ? getSessionThreads(snapshot, activeSessionRecord.id)
    : [];
  const activeSessionTasks = activeSessionRecord
    ? getSessionTasks(snapshot, activeSessionRecord.id)
    : [];
  const sessionTasks = activeThreadRecord
    ? activeSessionTasks.filter((task) => task.threadId === activeThreadRecord.id)
    : activeSessionTasks;
  const traceEvents = (activeThreadRecord
    ? snapshot.events.filter((event) => event.threadId === activeThreadRecord.id)
    : activeSessionRecord
      ? snapshot.events.filter((event) => event.sessionId === activeSessionRecord.id)
      : []
  ).sort((left, right) => compareStrings(left.timestamp, right.timestamp));
  const traceItems = traceEvents.map((event) => {
    const linkedFileChanges = snapshot.fileChanges.filter(
      (fileChange) => fileChange.eventId === event.id
    );

    return {
      eventId: event.id,
      projectName:
        getProjectById(snapshot, event.projectId)?.name ?? "Unknown project",
      summary: event.summary,
      category: event.category,
      eventType: event.eventType,
      originLabel: formatTitleCase(event.originType),
      nodeCategory: event.nodeCategory,
      fileChangeLabel:
        linkedFileChanges.length > 0
          ? pluralize(linkedFileChanges.length, "file change")
          : "No file changes",
      timestampLabel: formatTimestampLabel(event.timestamp),
      isEmphasized:
        activeThreadRecord !== null
          ? event.threadId === activeThreadRecord.id
          : activeSessionRecord !== null && event.sessionId === activeSessionRecord.id
    };
  });
  const traceFileChanges = (activeThreadRecord
    ? snapshot.fileChanges.filter((fileChange) => fileChange.threadId === activeThreadRecord.id)
    : activeSessionRecord
      ? snapshot.fileChanges.filter((fileChange) => fileChange.sessionId === activeSessionRecord.id)
      : []
  )
    .sort((left, right) => compareStrings(right.updatedAt, left.updatedAt))
    .map((fileChange) => ({
      fileChangeId: fileChange.id,
      path: fileChange.path,
      changeType: fileChange.changeType,
      summary: fileChange.summary ?? "No file-change summary recorded.",
      eventSummary:
        snapshot.events.find((event) => event.id === fileChange.eventId)?.summary ??
        "No linked event summary.",
      languageLabel: fileChange.language ?? fileChange.fileType,
      updatedAtLabel: formatTimestampLabel(fileChange.updatedAt)
    }));
  const relatedGuidance = getSessionScopedGuidanceItems(
    snapshot,
    activeSessionRecord,
    activeThreadRecord
  );
  const relatedActions = getSessionScopedActionItems(
    snapshot,
    activeSessionRecord,
    activeThreadRecord
  );
  const relatedMemory = getSessionScopedMemoryItems(
    snapshot,
    activeSessionRecord,
    activeThreadRecord,
    relatedGuidance,
    traceEvents
  );
  const linkedActionContext: SessionContextLinkModel[] = relatedActions
    .slice(0, 2)
    .map((actionItem) => ({
      id: `action:${actionItem.id}`,
      kind: "action",
      title: actionItem.title,
      summary: actionItem.summary ?? actionItem.riskSummary,
      meta: `${formatTitleCase(actionItem.state)} / ${formatTitleCase(
        actionItem.riskLevel
      )}`,
      tone: getActionTone(actionItem),
      targetId: actionItem.id
    }));
  const linkedGuidanceContext: SessionContextLinkModel[] = relatedGuidance
    .slice(0, 2)
    .map((guidanceItem) => {
      const tone: ShellCardModel["tone"] =
        guidanceItem.state === "injected" ? "plum" : "violet";

      return {
        id: `guidance:${guidanceItem.id}`,
        kind: "guidance",
        title: guidanceItem.title,
        summary: guidanceItem.summary,
        meta: `${formatTitleCase(guidanceItem.state)} / ${formatTitleCase(
          guidanceItem.source
        )}`,
        tone,
        targetId: guidanceItem.id
      };
    });
  const linkedMemoryContext: SessionContextLinkModel[] = relatedMemory
    .slice(0, 2)
    .map((memoryItem) => {
      const tone: ShellCardModel["tone"] =
        memoryItem.status === "stale" ? "amber" : "slate";

      return {
        id: `memory:${memoryItem.id}`,
        kind: "memory",
        title: memoryItem.summary,
        summary: memoryItem.content,
        meta: `${formatTitleCase(memoryItem.status)} / ${Math.round(
          memoryItem.confidence * 100
        )}% confidence`,
        tone,
        targetId: memoryItem.id
      };
    });
  const linkedContext: SessionContextLinkModel[] = [
    ...linkedActionContext,
    ...linkedGuidanceContext,
    ...linkedMemoryContext
  ];
  const sessionEvents = activeSessionRecord
    ? snapshot.events.filter((event) => event.sessionId === activeSessionRecord.id)
    : [];
  const threads = activeSessionThreads.map((thread) => {
    const threadTasks = activeSessionTasks.filter((task) => task.threadId === thread.id);
    const threadEvents = snapshot.events.filter((event) => event.threadId === thread.id);
    const threadFileChanges = snapshot.fileChanges.filter(
      (fileChange) => fileChange.threadId === thread.id
    );

    return {
      threadId: thread.id,
      title: thread.title,
      summary: thread.summary ?? "No thread summary recorded.",
      sourceLabel: resolveThreadSourceLabel(threadEvents, sessionEvents),
      status: thread.status,
      updatedAtLabel: formatTimestampLabel(thread.updatedAt),
      taskCount: threadTasks.length,
      eventCount: threadEvents.length,
      fileChangeCount: threadFileChanges.length,
      isActive: activeThreadRecord?.id === thread.id
    };
  });
  const tasks = sessionTasks.map((task) => ({
    taskId: task.id,
    title: task.title,
    summary: task.summary ?? "No task summary recorded.",
    status: task.status,
    priority: task.priority,
    updatedAtLabel: formatTimestampLabel(task.updatedAt)
  }));
  const focusDescription = activeThreadRecord
    ? `Focused thread: ${activeThreadRecord.title}.`
    : activeSessionRecord
      ? "Session-wide trace in view."
      : "Choose a session to inspect its threads.";

  return {
    title: "Sessions / Activity / Work Trace",
    body:
      "Session-first observability with thread-centered trace, ordered events, concrete file changes, and linked context kept secondary.",
    activeSessionId: activeSessionRecord?.id ?? null,
    activeThreadId: activeThreadRecord?.id ?? null,
    sessions,
    threads,
    tasks,
    traceItems,
    fileChanges: traceFileChanges,
    linkedContext,
    inspector: createCard(
      "sessions-inspector",
      "Activity Graph / Work Trace",
      activeSession?.title ?? "Select a session",
      activeSessionRecord
        ? `${activeSessionRecord.summary ?? "No summary."} ${focusDescription} ${pluralize(
            activeSessionThreads.length,
            "thread"
          )}, ${pluralize(activeSessionTasks.length, "task")}, ${pluralize(
            traceEvents.length,
            "event"
          )}, and ${pluralize(traceFileChanges.length, "file change")} are in view. Primary task: ${
            getPrimarySessionTask(snapshot, activeSessionRecord.id)?.title ??
            "No current task"
          }.`
        : "Choose a session to inspect its thread, task, and work-trace posture.",
      activeSessionRecord?.status === "active" ? "plum" : "slate"
    )
  };
}

function createTraceEventItem(
  snapshot: SubMindStoreSnapshot,
  event: Event,
  isEmphasized: boolean
): TraceEventItemModel {
  const linkedFileChanges = snapshot.fileChanges.filter(
    (fileChange) => fileChange.eventId === event.id
  );

  return {
    eventId: event.id,
    projectName: getProjectById(snapshot, event.projectId)?.name ?? "Unknown project",
    summary: event.summary,
    category: event.category,
    eventType: event.eventType,
    originLabel: formatTitleCase(event.originType),
    nodeCategory: event.nodeCategory,
    fileChangeLabel:
      linkedFileChanges.length > 0
        ? pluralize(linkedFileChanges.length, "file change")
        : "No file changes",
    timestampLabel: formatTimestampLabel(event.timestamp),
    isEmphasized
  };
}

function createSessionFileChangeItem(
  snapshot: SubMindStoreSnapshot,
  fileChange: FileChange
): SessionFileChangeItemModel {
  return {
    fileChangeId: fileChange.id,
    path: fileChange.path,
    changeType: fileChange.changeType,
    summary: fileChange.summary ?? "No file-change summary recorded.",
    eventSummary:
      snapshot.events.find((event) => event.id === fileChange.eventId)?.summary ??
      "No linked event summary.",
    languageLabel: fileChange.language ?? fileChange.fileType,
    updatedAtLabel: formatTimestampLabel(fileChange.updatedAt)
  };
}

function createRetainedHistoryItems(events: Event[]): RetainedHistoryItemModel[] {
  return events
    .sort((left, right) => compareStrings(right.timestamp, left.timestamp))
    .slice(0, 6)
    .map((event, index) => ({
      eventId: event.id,
      summary: event.summary,
      timestampLabel: formatTimestampLabel(event.timestamp),
      originLabel: formatTitleCase(event.originType),
      metaLabel: `${formatTitleCase(event.category)} / ${formatTitleCase(
        event.eventType
      )}`,
      isLatest: index === 0
    }));
}

function getMemorySupportEvents(
  snapshot: SubMindStoreSnapshot,
  memoryItem: MemoryItem
): Event[] {
  const sourceEventIds = new Set(memoryItem.sourceEventIds);

  return snapshot.events
    .filter(
      (event) => sourceEventIds.has(event.id) || event.memoryItemId === memoryItem.id
    )
    .sort((left, right) => compareStrings(right.timestamp, left.timestamp));
}

function getMemorySupportFiles(
  snapshot: SubMindStoreSnapshot,
  memoryItem: MemoryItem
): FileChange[] {
  const sourceFileIds = new Set(memoryItem.sourceFileChangeIds);

  for (const event of getMemorySupportEvents(snapshot, memoryItem)) {
    if (event.fileChangeId) {
      sourceFileIds.add(event.fileChangeId);
    }
  }

  return snapshot.fileChanges
    .filter((fileChange) => sourceFileIds.has(fileChange.id))
    .sort((left, right) => compareStrings(right.updatedAt, left.updatedAt));
}

function getMemoryLinkedContext(
  snapshot: SubMindStoreSnapshot,
  memoryItem: MemoryItem
): SessionContextLinkModel[] {
  const actions = snapshot.actions
    .filter((actionItem) => memoryItem.linkedActionItemIds.includes(actionItem.id))
    .slice(0, 2)
    .map((actionItem) => ({
      id: `memory-action:${actionItem.id}`,
      kind: "action" as const,
      title: actionItem.title,
      summary: actionItem.summary ?? actionItem.riskSummary,
      meta: `${formatTitleCase(actionItem.state)} / ${formatTitleCase(
        actionItem.riskLevel
      )}`,
      tone: getActionTone(actionItem),
      targetId: actionItem.id
    }));
  const guidance = snapshot.guidance
    .filter((guidanceItem) =>
      memoryItem.linkedGuidanceItemIds.includes(guidanceItem.id)
    )
    .slice(0, 2)
    .map((guidanceItem) => {
      const tone: ShellCardModel["tone"] =
        guidanceItem.state === "injected" ? "plum" : "violet";

      return {
        id: `memory-guidance:${guidanceItem.id}`,
        kind: "guidance" as const,
        title: guidanceItem.title,
        summary: guidanceItem.summary,
        meta: `${formatTitleCase(guidanceItem.state)} / ${formatTitleCase(
          guidanceItem.source
        )}`,
        tone,
        targetId: guidanceItem.id
      };
    });

  return [...actions, ...guidance];
}

function createMemoryView(
  snapshot: SubMindStoreSnapshot,
  state: ShellUiState,
  activeProject: Project | null,
  options: ShellViewModelOptions
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
    curationLabel: formatTitleCase(memoryItem.curationState),
    provenanceLabel: `${pluralize(memoryItem.sourceEventIds.length, "event")} / ${pluralize(
      memoryItem.sourceFileChangeIds.length,
      "file"
    )}`,
    changeLabel: memoryItem.changeSummary ?? "No recent change summary.",
    isPinned: memoryItem.isPinned,
    isActive: state.activeMemoryId === memoryItem.id,
    isEmphasized: activeProject?.id === memoryItem.projectId
  }));

  const activeMemory =
    memoryPool.find((memoryItem) => memoryItem.id === state.activeMemoryId) ??
    memoryPool[0] ??
    null;
  const supportEvents = activeMemory
    ? getMemorySupportEvents(snapshot, activeMemory)
    : [];
  const supportFiles = activeMemory
    ? getMemorySupportFiles(snapshot, activeMemory)
    : [];
  const linkedContext = activeMemory
    ? getMemoryLinkedContext(snapshot, activeMemory)
    : [];
  const historyItems = createRetainedHistoryItems(supportEvents);

  return {
    title: "Memory",
    body:
      "Retained intelligence showing what SubMind knows, how sure it is, how fresh it is, where it came from, and what changed.",
    cards,
    inspector: {
      memoryId: activeMemory?.id ?? null,
      title: activeMemory?.summary ?? "Select a memory item",
      content:
        activeMemory?.content ??
        "Choose a memory card to inspect retained knowledge, provenance, and recent change posture.",
      projectName:
        activeMemory
          ? getProjectById(snapshot, activeMemory.projectId ?? "")?.name ?? "Global"
          : "Global",
      bucketLabel: activeMemory
        ? formatTitleCase(activeMemory.bucket)
        : "No bucket selected",
      statusLabel: activeMemory
        ? formatTitleCase(activeMemory.status)
        : "No status",
      confidenceLabel: activeMemory
        ? `${Math.round(activeMemory.confidence * 100)}% confidence`
        : "No confidence signal",
      freshnessLabel: activeMemory
        ? `${Math.round(activeMemory.freshness * 100)}% fresh`
        : "No freshness signal",
      curationLabel: activeMemory
        ? formatTitleCase(activeMemory.curationState)
        : "No curation state",
      provenanceSummary: activeMemory
        ? `${pluralize(activeMemory.sourceEventIds.length, "source event")} and ${pluralize(
            activeMemory.sourceFileChangeIds.length,
            "source file"
          )} currently support this memory.`
        : "No provenance available.",
      changeSummary:
        activeMemory?.changeSummary ??
        "No recent change summary has been recorded for this memory.",
      linkedContext,
      sourceEvents: supportEvents.map((event) =>
        createTraceEventItem(snapshot, event, true)
      ),
      sourceFiles: supportFiles.map((fileChange) =>
        createSessionFileChangeItem(snapshot, fileChange)
      ),
      historyItems,
      isPinned: activeMemory?.isPinned ?? false
    },
    draftSummary: options.memorySummaryDraft ?? activeMemory?.summary ?? "",
    draftContent: options.memoryContentDraft ?? activeMemory?.content ?? "",
    draftStatus: options.memoryStatusDraft ?? activeMemory?.status ?? "",
    draftIsPinned: options.memoryPinnedDraft ?? activeMemory?.isPinned ?? false,
    isMutationPending: options.isMemoryMutationPending ?? false
  };
}

function getGuidanceMemoryItems(
  snapshot: SubMindStoreSnapshot,
  guidanceItem: GuidanceItem
): MemoryItem[] {
  if (guidanceItem.linkedMemoryItemIds.length > 0) {
    return snapshot.memory.filter((memoryItem) =>
      guidanceItem.linkedMemoryItemIds.includes(memoryItem.id)
    );
  }

  return snapshot.memory.filter((memoryItem) => {
    if (memoryItem.projectId !== guidanceItem.projectId) {
      return false;
    }

    if (guidanceItem.threadId && memoryItem.threadId === guidanceItem.threadId) {
      return true;
    }

    if (guidanceItem.sessionId && memoryItem.sessionId === guidanceItem.sessionId) {
      return true;
    }

    return !guidanceItem.threadId && !guidanceItem.sessionId;
  });
}

function getGuidanceActionItems(
  snapshot: SubMindStoreSnapshot,
  guidanceItem: GuidanceItem
): ActionItem[] {
  if (guidanceItem.linkedActionItemIds.length > 0) {
    return snapshot.actions.filter((actionItem) =>
      guidanceItem.linkedActionItemIds.includes(actionItem.id)
    );
  }

  return snapshot.actions.filter((actionItem) => {
    if (actionItem.projectId !== guidanceItem.projectId) {
      return false;
    }

    if (guidanceItem.threadId && actionItem.threadId === guidanceItem.threadId) {
      return true;
    }

    if (guidanceItem.sessionId && actionItem.sessionId === guidanceItem.sessionId) {
      return true;
    }

    return !guidanceItem.threadId && !guidanceItem.sessionId;
  });
}

function getGuidanceSupportEvents(
  snapshot: SubMindStoreSnapshot,
  guidanceItem: GuidanceItem
): Event[] {
  const linkedEventIds = new Set(guidanceItem.linkedEventIds);

  return snapshot.events
    .filter((event) => {
      if (event.guidanceItemId === guidanceItem.id) {
        return true;
      }

      if (linkedEventIds.has(event.id)) {
        return true;
      }

      return false;
    })
    .sort((left, right) => compareStrings(right.timestamp, left.timestamp));
}

function createGuidanceView(
  snapshot: SubMindStoreSnapshot,
  state: ShellUiState,
  activeProject: Project | null
): SubMindShellViewModel["guidance"] {
  const guidanceCheckpoint = createGuidanceCheckpointSummary(
    snapshot,
    activeProject?.id ?? null
  );
  const guidancePool = activeProject
    ? [
        ...getProjectGuidanceItems(snapshot, activeProject.id),
        ...snapshot.guidance.filter((guidanceItem) => guidanceItem.projectId !== activeProject.id)
      ]
    : [...snapshot.guidance];

  const cards = guidancePool.map((guidanceItem) => {
    const linkedMemory = getGuidanceMemoryItems(snapshot, guidanceItem);
    const relatedActions = getGuidanceActionItems(snapshot, guidanceItem);

    return {
      guidanceId: guidanceItem.id,
      title: guidanceItem.title,
      summary: guidanceItem.summary,
      state: guidanceItem.state,
      source: guidanceItem.source,
      projectName:
        getProjectById(snapshot, guidanceItem.projectId)?.name ?? "Unknown project",
      confidenceLabel: `${Math.round(guidanceItem.confidence * 100)}% confidence`,
      evidenceLabel: guidanceItem.evidenceSummary,
      policyLabel: guidanceItem.policySummary,
      linkedMemoryLabel: `${pluralize(linkedMemory.length, "memory ref")}`,
      actionPressureLabel: `${pluralize(relatedActions.length, "related action")}`,
      isActive: state.activeGuidanceId === guidanceItem.id,
      isEmphasized: activeProject?.id === guidanceItem.projectId
    };
  });

  const activeGuidance =
    guidancePool.find((guidanceItem) => guidanceItem.id === state.activeGuidanceId) ??
    guidancePool[0] ??
    null;
  const activeGuidanceMemory = activeGuidance
    ? getGuidanceMemoryItems(snapshot, activeGuidance)
    : [];
  const activeGuidanceActions = activeGuidance
    ? getGuidanceActionItems(snapshot, activeGuidance)
    : [];
  const activeGuidanceEvents = activeGuidance
    ? getGuidanceSupportEvents(snapshot, activeGuidance)
    : [];
  const linkedContext: SessionContextLinkModel[] = [
    ...activeGuidanceActions.slice(0, 2).map((actionItem) => ({
      id: `guidance-action:${actionItem.id}`,
      kind: "action" as const,
      title: actionItem.title,
      summary: actionItem.summary ?? actionItem.riskSummary,
      meta: `${formatTitleCase(actionItem.state)} / ${formatTitleCase(actionItem.riskLevel)}`,
      tone: getActionTone(actionItem),
      targetId: actionItem.id
    })),
    ...activeGuidanceMemory.slice(0, 2).map((memoryItem) => {
      const tone: ShellCardModel["tone"] =
        memoryItem.status === "stale" ? "amber" : "slate";

      return {
        id: `guidance-memory:${memoryItem.id}`,
        kind: "memory" as const,
        title: memoryItem.summary,
        summary: memoryItem.changeSummary ?? memoryItem.content,
        meta: `${formatTitleCase(memoryItem.status)} / ${Math.round(
          memoryItem.confidence * 100
        )}% confidence`,
        tone,
        targetId: memoryItem.id
      };
    })
  ];

  return {
    title: "Guidance",
    body:
      "Transparent intervention surface showing what SubMind recommended, why it recommended it, what evidence supported it, and which memory/action context shaped the decision.",
    posture: createCard(
      "guidance-posture",
      "Guidance Checkpoint",
      guidanceCheckpoint.recommendedTitle,
      `${guidanceCheckpoint.recommendedBody} Dominant source: ${
        guidanceCheckpoint.dominantSource
      }. ${pluralize(guidanceCheckpoint.relatedActionCount, "action")} visible in scope.`,
      guidanceCheckpoint.highRiskActionCount > 0
        ? "amber"
        : guidanceCheckpoint.injectedCount > 0
          ? "plum"
          : "violet"
    ),
    cards,
    inspector: {
      guidanceId: activeGuidance?.id ?? null,
      title: activeGuidance?.title ?? "Select guidance",
      summary:
        activeGuidance?.summary ??
        "Choose a guidance package to inspect recommendation truth and linked evidence.",
      rationale:
        activeGuidance?.rationale ??
        "Rationale appears once a guidance package is selected.",
      projectName:
        activeGuidance
          ? getProjectById(snapshot, activeGuidance.projectId)?.name ?? "Unknown project"
          : "Unknown project",
      stateLabel: activeGuidance
        ? formatTitleCase(activeGuidance.state)
        : "No state",
      sourceLabel: activeGuidance
        ? formatTitleCase(activeGuidance.source)
        : "No source",
      confidenceLabel: activeGuidance
        ? `${Math.round(activeGuidance.confidence * 100)}% confidence`
        : "No confidence signal",
      evidenceSummary:
        activeGuidance?.evidenceSummary ??
        "No evidence summary available yet.",
      policySummary:
        activeGuidance?.policySummary ??
        "No policy summary available yet.",
      linkedContext,
      evidenceEvents: activeGuidanceEvents.map((event) =>
        createTraceEventItem(snapshot, event, true)
      ),
      historyItems: createRetainedHistoryItems(activeGuidanceEvents)
    }
  };
}

function getActionGuidanceItems(
  snapshot: SubMindStoreSnapshot,
  actionItem: ActionItem
): GuidanceItem[] {
  return snapshot.guidance.filter((guidanceItem) => {
    if (guidanceItem.projectId !== actionItem.projectId) {
      return false;
    }

    if (actionItem.threadId && guidanceItem.threadId === actionItem.threadId) {
      return true;
    }

    if (actionItem.sessionId && guidanceItem.sessionId === actionItem.sessionId) {
      return true;
    }

    return !actionItem.threadId && !actionItem.sessionId;
  });
}

function getActionMemoryItems(
  snapshot: SubMindStoreSnapshot,
  actionItem: ActionItem
): MemoryItem[] {
  const memoryIds = new Set<string>();

  for (const guidanceItem of getActionGuidanceItems(snapshot, actionItem)) {
    for (const memoryId of guidanceItem.linkedMemoryItemIds) {
      memoryIds.add(memoryId);
    }
  }

  for (const event of snapshot.events) {
    const matchesAction =
      event.actionItemId === actionItem.id ||
      (event.projectId === actionItem.projectId &&
        ((actionItem.threadId && event.threadId === actionItem.threadId) ||
          (!actionItem.threadId &&
            actionItem.sessionId &&
            event.sessionId === actionItem.sessionId)));

    if (matchesAction && event.memoryItemId) {
      memoryIds.add(event.memoryItemId);
    }
  }

  return snapshot.memory.filter((memoryItem) => memoryIds.has(memoryItem.id));
}

function getActionFileChanges(
  snapshot: SubMindStoreSnapshot,
  actionItem: ActionItem
): ReturnType<typeof getProjectFileChanges> {
  return snapshot.fileChanges.filter((fileChange) => {
    if (fileChange.projectId !== actionItem.projectId) {
      return false;
    }

    if (actionItem.threadId && fileChange.threadId === actionItem.threadId) {
      return true;
    }

    if (actionItem.sessionId && fileChange.sessionId === actionItem.sessionId) {
      return true;
    }

    return !actionItem.threadId && !actionItem.sessionId;
  });
}

function getActionSupportCount(
  snapshot: SubMindStoreSnapshot,
  actionItem: ActionItem
): number {
  return snapshot.events.filter((event) => {
    if (event.actionItemId === actionItem.id) {
      return true;
    }

    if (event.projectId !== actionItem.projectId) {
      return false;
    }

    if (actionItem.threadId && event.threadId === actionItem.threadId) {
      return true;
    }

    if (actionItem.sessionId && event.sessionId === actionItem.sessionId) {
      return true;
    }

    return false;
  }).length;
}

function describeActionControls(actionItem: ActionItem): string {
  switch (actionItem.state) {
    case "pending":
      return "approve, reject, or hold while more context is gathered";
    case "in_progress":
      return "let it continue, block it, or resolve once the outcome matches intent";
    case "blocked":
      return "unblock with a revised path, reject it, or keep it parked";
    case "approved":
      return "monitor the actual outcome and close the audit loop";
    case "rejected":
      return "document fallout or reopen if assumptions change";
    case "resolved":
      return "review the audit trail and keep the outcome on record";
    default:
      return "review the action and decide the next control step";
  }
}

function getActionTone(actionItem: ActionItem | undefined): ShellCardModel["tone"] {
  if (!actionItem) {
    return "slate";
  }

  if (["high", "critical"].includes(actionItem.riskLevel)) {
    return "amber";
  }

  if (actionItem.state === "pending" || actionItem.state === "in_progress") {
    return "plum";
  }

  if (actionItem.state === "blocked") {
    return "violet";
  }

  return "slate";
}

function getActionQueueRank(actionItem: ActionItem): number {
  switch (actionItem.state) {
    case "pending":
      return 0;
    case "in_progress":
      return 1;
    case "blocked":
      return 2;
    case "approved":
      return 3;
    case "rejected":
      return 4;
    case "resolved":
      return 5;
    default:
      return 6;
  }
}

function getActionTransitionControls(
  actionItem: ActionItem | undefined,
  isMutationPending: boolean
): ActionTransitionControlModel[] {
  if (!actionItem) {
    return [];
  }

  const controls: ActionTransitionState[] = [];

  if (actionItem.state === "pending") {
    controls.push("approved", "rejected", "blocked");
  } else if (actionItem.state === "in_progress") {
    controls.push("approved", "blocked", "resolved", "rejected");
  } else if (actionItem.state === "approved") {
    controls.push("resolved", "blocked", "rejected");
  } else if (actionItem.state === "blocked") {
    controls.push("approved", "resolved", "rejected");
  }

  return controls.map((nextState) => ({
    nextState,
    label: formatTitleCase(nextState),
    tone:
      nextState === "approved"
        ? "plum"
        : nextState === "blocked"
          ? "violet"
          : nextState === "rejected"
            ? "amber"
            : "slate",
    description:
      nextState === "approved"
        ? "Confirm the plan and keep the loop moving."
        : nextState === "blocked"
          ? "Pause execution until the missing condition is resolved."
          : nextState === "rejected"
            ? "Stop the action and record why it should not proceed."
            : "Close the loop once the real outcome matches intent.",
    isDisabled: isMutationPending
  }));
}

function getActionHistoryItems(
  snapshot: SubMindStoreSnapshot,
  actionItem: ActionItem | undefined
): ActionHistoryItemModel[] {
  if (!actionItem) {
    return [];
  }

  return snapshot.events
    .filter(
      (event) =>
        event.actionItemId === actionItem.id &&
        event.eventType === "action-state-transition"
    )
    .sort((left, right) => compareStrings(right.timestamp, left.timestamp))
    .map((event, index) => {
      const previousState =
        typeof event.metadata.previousState === "string"
          ? event.metadata.previousState
          : null;
      const nextState =
        typeof event.metadata.nextState === "string"
          ? event.metadata.nextState
          : null;
      const actor =
        typeof event.metadata.actor === "string"
          ? event.metadata.actor
          : event.originType;

      return {
        eventId: event.id,
        summary: event.summary,
        timestampLabel: formatTimestampLabel(event.timestamp),
        actorLabel: formatTitleCase(actor),
        transitionLabel:
          previousState && nextState
            ? `${formatTitleCase(previousState)} -> ${formatTitleCase(nextState)}`
            : nextState
              ? formatTitleCase(nextState)
              : formatTitleCase(event.eventType),
        isLatest: index === 0
      };
    });
}

function createActionsView(
  snapshot: SubMindStoreSnapshot,
  state: ShellUiState,
  activeProject: Project | null,
  options: ShellViewModelOptions
): SubMindShellViewModel["actions"] {
  const actionCheckpoint = createActionCheckpointSummary(
    snapshot,
    activeProject?.id ?? null
  );
  const actionsPool = (activeProject
    ? [
        ...getProjectActionItems(snapshot, activeProject.id),
        ...snapshot.actions.filter((actionItem) => actionItem.projectId !== activeProject.id)
      ]
    : [...snapshot.actions]
  ).sort((left, right) => {
    const rankDelta = getActionQueueRank(left) - getActionQueueRank(right);

    if (rankDelta !== 0) {
      return rankDelta;
    }

    return compareStrings(right.updatedAt, left.updatedAt);
  });

  const cards = actionsPool.map((actionItem) => {
    const relatedGuidance = getActionGuidanceItems(snapshot, actionItem);
    const relatedFiles = getActionFileChanges(snapshot, actionItem);

    return {
      actionId: actionItem.id,
      title: actionItem.title,
      summary: actionItem.summary ?? actionItem.riskSummary,
      state: actionItem.state,
      riskLevel: actionItem.riskLevel,
      projectName:
        getProjectById(snapshot, actionItem.projectId)?.name ?? "Unknown project",
      owner: actionItem.owner,
      contextLabel: `${pluralize(relatedGuidance.length, "guidance link")} / ${pluralize(
        relatedFiles.length,
        "file change"
      )}`,
      outcomeLabel: actionItem.actualOutcome
        ? "actual outcome captured"
        : actionItem.expectedOutcome
          ? "expected outcome set"
          : "outcome pending",
      isActive: state.activeActionId === actionItem.id,
      isEmphasized: activeProject?.id === actionItem.projectId
    };
  });

  const activeAction =
    actionsPool.find((actionItem) => actionItem.id === state.activeActionId) ??
    actionsPool[0];
  const activeActionGuidance = activeAction
    ? getActionGuidanceItems(snapshot, activeAction)
    : [];
  const activeActionMemory = activeAction
    ? getActionMemoryItems(snapshot, activeAction)
    : [];
  const activeActionFiles = activeAction
    ? getActionFileChanges(snapshot, activeAction)
    : [];
  const activeActionSupportCount = activeAction
    ? getActionSupportCount(snapshot, activeAction)
    : 0;
  const activeActionSession = activeAction?.sessionId
    ? snapshot.sessions.find((session) => session.id === activeAction.sessionId) ?? null
    : null;
  const activeActionThread = activeAction?.threadId
    ? snapshot.threads.find((thread) => thread.id === activeAction.threadId) ?? null
    : null;
  const activeActionTask = activeAction
    ? snapshot.tasks.find((task) =>
        activeAction.threadId
          ? task.threadId === activeAction.threadId
          : activeAction.sessionId
            ? task.sessionId === activeAction.sessionId
            : false
      ) ?? null
    : null;
  const activeActionGuidanceSummary =
    activeActionGuidance.length > 0
      ? activeActionGuidance
          .slice(0, 2)
          .map((guidanceItem) => guidanceItem.title)
          .join(" / ")
      : "No related guidance";
  const activeActionMemorySummary =
    activeActionMemory.length > 0
      ? activeActionMemory
          .slice(0, 2)
          .map((memoryItem) => memoryItem.summary)
          .join(" / ")
      : "No linked memory";
  const activeActionFileSummary =
    activeActionFiles.length > 0
      ? activeActionFiles
          .slice(0, 2)
          .map((fileChange) => fileChange.path)
          .join(" / ")
      : "No related file changes";
  const activeActionScopeSummary = [
    activeActionSession ? `Session: ${activeActionSession.summary ?? activeActionSession.id}` : null,
    activeActionThread ? `Thread: ${activeActionThread.title}` : null,
    activeActionTask ? `Task: ${activeActionTask.title}` : null
  ]
    .filter(Boolean)
    .join(". ");
  const activeActionTone = getActionTone(activeAction);
  const isMutationPending = options.isActionMutationPending ?? false;
  const transitionControls = getActionTransitionControls(
    activeAction,
    isMutationPending
  );
  const historyItems = getActionHistoryItems(snapshot, activeAction);
  const actualOutcome =
    options.actionOutcomeDraft ?? activeAction?.actualOutcome ?? "";

  return {
    title: "Actions",
    body:
      "Inbox / approval / control / audit surface with queue pressure, explicit operator options, and deeper context on demand.",
    posture: createCard(
      "action-posture",
      "Action Checkpoint",
      actionCheckpoint.recommendedTitle,
      `${actionCheckpoint.recommendedBody} ${pluralize(
        actionCheckpoint.relatedGuidanceCount,
        "guidance package"
      )}, ${pluralize(actionCheckpoint.relatedMemoryCount, "memory item")}, and ${pluralize(
        actionCheckpoint.relatedFileChangeCount,
        "file change"
      )} are visible in scope.`,
      actionCheckpoint.highRiskCount > 0
        ? "amber"
        : actionCheckpoint.openCount > 0
          ? "plum"
          : "slate"
    ),
    cards,
    activeActionId: activeAction?.id ?? null,
    mainView: createCard(
      "action-main-view",
      "Action Main View",
      activeAction?.title ?? "Select an action",
      activeAction
        ? `${activeAction.summary ?? activeAction.riskSummary} Options: ${describeActionControls(
            activeAction
          )}. Expected outcome: ${
            activeAction.expectedOutcome ?? "No expected outcome recorded yet."
          }`
        : "Choose an action to promote it into the main control surface.",
      activeActionTone
    ),
    expectedOutcome:
      activeAction?.expectedOutcome ?? "No expected outcome recorded yet.",
    actualOutcome,
    actualOutcomePlaceholder: activeAction
      ? "Record what actually happened, variance from expectation, or the operator's final note."
      : "Select an action to capture actual outcome.",
    transitionControls,
    historyItems,
    isMutationPending,
    pendingActionTransition: options.pendingActionTransition ?? null,
    inspector: createCard(
      "action-inspector",
      "Audit / Context Inspector",
      activeAction?.title ?? "Select an action",
      activeAction
        ? `Would happen: ${
            activeAction.expectedOutcome ?? "No expected outcome recorded."
          } Did happen: ${
            activeAction.actualOutcome ?? "No actual outcome recorded yet."
          } Scope: ${activeActionScopeSummary || "Scope detail still forming."} Related guidance: ${activeActionGuidanceSummary}. Memory: ${activeActionMemorySummary}. Files: ${activeActionFileSummary}. Support: ${pluralize(
            activeActionSupportCount,
            "event"
          )}. Risk factors: ${
            activeAction.riskFactors.length > 0
              ? activeAction.riskFactors.join(", ")
              : "none recorded"
          }.`
        : "Choose an action to inspect its risk, outcome intent, and related work context.",
      activeActionTone
    )
  };
}

function createProtectedShellSnapshot(
  snapshot: SubMindStoreSnapshot,
  state: ShellUiState
): SubMindStoreSnapshot {
  return redactSensitiveObject(snapshot, {
    revealFingerprints: state.secretRevealTarget
      ? [state.secretRevealTarget.fingerprint]
      : []
  });
}

function createSecretProtectionModel(
  state: ShellUiState
): SecretProtectionModel {
  return {
    target: state.secretRevealTarget,
    label: state.secretRevealTarget?.label ?? "No selected secret",
    canReveal: false,
    isRevealing: !!state.secretRevealTarget,
    redactionCount: 0,
    kindLabels: state.secretRevealTarget ? [state.secretRevealTarget.label] : [],
    autoHideMs: 30_000
  };
}

function createProjectSearchResultLabel(
  filteredCount: number,
  totalCount: number,
  isFiltering: boolean
): string {
  if (!isFiltering) {
    return `${totalCount} projects`;
  }

  return filteredCount === 1
    ? `1 of ${totalCount} project`
    : `${filteredCount} of ${totalCount} projects`;
}

export function createShellViewModel(
  snapshot: SubMindStoreSnapshot,
  state: ShellUiState,
  options: ShellViewModelOptions = {}
): SubMindShellViewModel {
  const secretProtection = createSecretProtectionModel(state);
  const viewSnapshot = createProtectedShellSnapshot(snapshot, state);
  const viewOptions = redactSensitiveObject(options, {
    revealFingerprints: state.secretRevealTarget
      ? [state.secretRevealTarget.fingerprint]
      : []
  });
  const activeProject = getProjectById(viewSnapshot, getActiveProjectId(state) ?? "");
  const scope = getShellScope(state);
  const projectStackCards = createProjectStackCards(
    viewSnapshot,
    state,
    activeProject
  );
  const projectSearchQuery = state.projectSearchQuery.trim();
  const isProjectFiltering = projectSearchQuery.length > 0;

  return {
    layoutMode: state.layoutMode,
    primaryScreen: state.primaryScreen,
    scope,
    activeProject,
    secretProtection,
    commandStrip: {
      title: "SubMind",
      subtitle:
        scope === "project"
          ? "Project room with persistent trace, memory, guidance, and action control."
          : "Global operator console with project-aware scope and active context.",
      metrics: [
        { label: "Scope", value: scope === "project" ? "project-focused" : "global" },
        { label: "Projects", value: String(viewSnapshot.projects.length) },
        { label: "Screen", value: state.primaryScreen },
        activeProject
          ? {
              label: "Active",
              value: activeProject.name,
              action: state.focusedProjectId
                ? {
                    kind: "clear-focus",
                    label: "Exit",
                    value: "Focus"
                  }
                : {
                    kind: "clear-selection",
                    label: "Clear",
                    value: "Selection"
                  }
            }
          : { label: "Active", value: "none" }
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
      search: {
        query: state.projectSearchQuery,
        placeholder: "Search projects",
        resultLabel: createProjectSearchResultLabel(
          projectStackCards.length,
          viewSnapshot.projects.length,
          isProjectFiltering
        ),
        filteredCount: projectStackCards.length,
        totalCount: viewSnapshot.projects.length,
        isFiltering: isProjectFiltering
      },
      cards: projectStackCards,
      focusedContextCards: createFocusedContextCards(viewSnapshot, activeProject, state)
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
          ? `${activeProject.name} is now magnetized: its trace, guidance, and recent changes are weighted above the wider board while the rest of the world stays visible.`
          : scope === "project"
            ? `${activeProject?.name ?? "This project"} is now the active project room: work trace, retained context, and control are narrowed here while the stack stays visible around the room.`
            : "Cross-project command center with no single project dominating the main content area.",
      screens: primaryScreens.map((screen) => ({
        id: screen,
        label: screen,
        isActive: state.primaryScreen === screen
      }))
    },
    dashboard: createDashboardView(viewSnapshot, state, activeProject),
    sessions: createSessionsView(viewSnapshot, state, activeProject),
    memory: createMemoryView(viewSnapshot, state, activeProject, viewOptions),
    guidance: createGuidanceView(viewSnapshot, state, activeProject),
    actions: createActionsView(viewSnapshot, state, activeProject, viewOptions)
  };
}
