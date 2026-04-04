import {
  useEffect,
  useRef,
  type MouseEvent,
  type ReactNode
} from "react";
import type {
  ActionCardModel,
  ActionHistoryItemModel,
  ActionTransitionControlModel,
  GuidanceCardModel,
  LayoutMode,
  MemoryCardModel,
  PrimaryScreen,
  ProjectStackCardModel,
  SessionContextLinkModel,
  SessionFileChangeItemModel,
  SessionListItemModel,
  SessionTaskItemModel,
  SessionThreadItemModel,
  ShellCardModel,
  SubMindShellViewModel,
  TraceEventItemModel
} from "@submind/ui-state";

export interface SubMindShellActions {
  onLayoutModeChange: (layoutMode: LayoutMode) => void;
  onPrimaryScreenChange: (screen: PrimaryScreen) => void;
  onSelectProject: (projectId: string) => void;
  onToggleProjectFocus: (projectId: string) => void;
  onFocusSelectedProject: () => void;
  onClearProjectSelection: () => void;
  onClearProjectFocus: () => void;
  onSelectSession: (sessionId: string) => void;
  onSelectThread: (threadId: string) => void;
  onSelectMemory: (memoryId: string) => void;
  onSelectGuidance: (guidanceId: string) => void;
  onSelectAction: (actionId: string) => void;
  onActionOutcomeDraftChange: (value: string) => void;
  onTransitionAction: (
    actionId: string,
    nextState: ActionTransitionControlModel["nextState"]
  ) => void;
  onMemorySummaryDraftChange: (value: string) => void;
  onMemoryContentDraftChange: (value: string) => void;
  onMemoryStatusDraftChange: (
    status: SubMindShellViewModel["memory"]["draftStatus"]
  ) => void;
  onMemoryPinnedDraftChange: (isPinned: boolean) => void;
  onSaveMemory: (curationState: "confirmed" | "edited") => void;
}

export interface SubMindShellProps {
  viewModel: SubMindShellViewModel;
  actions: SubMindShellActions;
}

type SurfaceVariant = "panel" | "muted" | "elevated";
type ToneCardSize = "hero" | "support" | "detail" | "stack";
type DashboardMode = "unselected" | "selected" | "focused";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getDashboardMode(viewModel: SubMindShellViewModel): DashboardMode {
  if (viewModel.scope === "project") {
    return "focused";
  }

  if (viewModel.activeProject) {
    return "selected";
  }

  return "unselected";
}

function Surface({
  children,
  className,
  variant = "panel"
}: {
  children: ReactNode;
  className?: string;
  variant?: SurfaceVariant;
}) {
  return (
    <section
      data-surface={variant}
      className={cx(
        "sm-surface",
        variant === "elevated"
          ? "sm-surface--elevated"
          : variant === "muted"
            ? "sm-surface--muted"
            : "sm-surface--panel",
        className
      )}
    >
      {children}
    </section>
  );
}

function getToneCardClasses(
  card: ShellCardModel,
  size: ToneCardSize,
  emphasized = false,
  interactive = false,
  className?: string
): string {
  return cx(
    "sm-tone-card",
    card.tone === "plum"
      ? "sm-tone-card--plum"
      : card.tone === "violet"
        ? "sm-tone-card--violet"
        : card.tone === "amber"
          ? "sm-tone-card--amber"
          : "sm-tone-card--slate",
    size === "hero"
      ? "sm-tone-card--hero"
      : size === "detail"
        ? "sm-tone-card--detail"
        : size === "stack"
          ? "sm-tone-card--stack"
          : "sm-tone-card--support",
    emphasized && "sm-tone-card--emphasized",
    interactive && "sm-tone-card--interactive",
    className
  );
}

function ToneCard({
  card,
  size = "support",
  className,
  emphasized = false,
  onClick,
  actionLabel
}: {
  card: ShellCardModel;
  size?: ToneCardSize;
  className?: string;
  emphasized?: boolean;
  onClick?: () => void;
  actionLabel?: string;
}) {
  const toneClasses = getToneCardClasses(
    card,
    size,
    emphasized,
    !!onClick,
    className
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} data-tone={card.tone} className={toneClasses}>
        <p className="sm-tone-card__label">{card.label}</p>
        <h3 className="sm-display sm-tone-card__title">{card.title}</h3>
        <p className="sm-tone-card__body">{card.body}</p>
        {actionLabel ? (
          <span className="sm-tone-card__action">{actionLabel}</span>
        ) : null}
      </button>
    );
  }

  return (
    <article data-tone={card.tone} className={toneClasses}>
      <p className="sm-tone-card__label">{card.label}</p>
      <h3 className="sm-display sm-tone-card__title">{card.title}</h3>
      <p className="sm-tone-card__body">{card.body}</p>
    </article>
  );
}

function ActionHistoryItem({ item }: { item: ActionHistoryItemModel }) {
  return (
    <article
      className={cx(
        "sm-action-history__item",
        item.isLatest && "sm-action-history__item--latest"
      )}
    >
      <div className="sm-action-history__meta">
        <span className="sm-label">{item.transitionLabel}</span>
        <span>{item.timestampLabel}</span>
      </div>
      <p className="sm-action-history__summary">{item.summary}</p>
      <p className="sm-action-history__actor">Actor: {item.actorLabel}</p>
    </article>
  );
}

function RetainedHistoryItem({
  item
}: {
  item: SubMindShellViewModel["memory"]["inspector"]["historyItems"][number];
}) {
  return (
    <article
      className={cx(
        "sm-action-history__item",
        item.isLatest && "sm-action-history__item--latest"
      )}
    >
      <div className="sm-action-history__meta">
        <span className="sm-label">{item.metaLabel}</span>
        <span>{item.timestampLabel}</span>
      </div>
      <p className="sm-action-history__summary">{item.summary}</p>
      <p className="sm-action-history__actor">Origin: {item.originLabel}</p>
    </article>
  );
}

function InteractiveCard({
  children,
  className,
  attention = false,
  isActive = false,
  isEmphasized = false,
  onClick
}: {
  children: ReactNode;
  className?: string;
  attention?: boolean;
  isActive?: boolean;
  isEmphasized?: boolean;
  onClick?: () => void;
}) {
  const classes = cx(
    "sm-record-card",
    onClick && "sm-record-card--interactive",
    isActive && "sm-record-card--active",
    isEmphasized && "sm-record-card--emphasized",
    attention && "sm-record-card--attention",
    className
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {children}
      </button>
    );
  }

  return <div className={classes}>{children}</div>;
}

function MetricBlock({
  label,
  value
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="sm-project-card__metric">
      <span className="sm-project-card__metric-label">{label}</span>
      <span className="sm-project-card__metric-value">{value}</span>
    </div>
  );
}

function ProjectCard({
  card,
  onSelect,
  onFocus
}: {
  card: ProjectStackCardModel;
  onSelect: (projectId: string) => void;
  onFocus: (projectId: string) => void;
}) {
  const clickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (event.detail > 1) {
      return;
    }

    clickTimerRef.current = window.setTimeout(() => {
      onSelect(card.projectId);
      clickTimerRef.current = null;
    }, 200);
  }

  function handleDoubleClick() {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }

    onFocus(card.projectId);
  }

  const focusActionLabel =
    card.state === "focused" ? "Exit Focus" : "Focus";

  return (
    <article data-project-state={card.state} className="sm-project-card">
      <button
        type="button"
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        className="sm-project-card__select"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="sm-project-card__identity">
            <span className="sm-display sm-project-card__title">{card.name}</span>
            <span className="sm-project-card__description">{card.description}</span>
          </div>
          {card.state !== "unselected" ? (
            <div className="sm-project-card__status-spacer" />
          ) : null}
        </div>

        <p className="sm-project-card__summary">{card.summary}</p>

        <div className="sm-project-card__metrics">
          <MetricBlock label="Sessions" value={card.sessionCount} />
          <MetricBlock label="Guidance" value={card.guidanceCount} />
          <MetricBlock label="Actions" value={card.actionCount} />
          <MetricBlock label="Last Touched" value={card.lastTouchedLabel} />
        </div>

        <div className="sm-project-card__tags">
          {card.descriptors.map((descriptor) => (
            <span key={descriptor} className="sm-project-card__tag">
              {descriptor}
            </span>
          ))}
        </div>
      </button>

      {card.state !== "unselected" ? (
        <div className="sm-project-card__status-zone">
          <button
            type="button"
            onClick={() => onFocus(card.projectId)}
            className={cx(
              "sm-project-card__affordance",
              card.state === "selected" && "sm-project-card__affordance--selected",
              card.state === "focused" && "sm-project-card__affordance--focused"
            )}
          >
            <span className="sm-project-card__affordance-default">
              {titleCase(card.state)}
            </span>
            <span className="sm-project-card__affordance-action">
              {focusActionLabel}
            </span>
          </button>
        </div>
      ) : null}
    </article>
  );
}

function SessionCard({
  item,
  onSelect
}: {
  item: SessionListItemModel;
  onSelect: (sessionId: string) => void;
}) {
  return (
    <InteractiveCard
      isActive={item.isActive}
      isEmphasized={item.isEmphasized}
      onClick={() => onSelect(item.sessionId)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <span className="sm-label">Session</span>
          <span className="text-base font-semibold text-[var(--sm-text-strong)]">
            {item.title}
          </span>
          <span className="text-xs text-[var(--sm-text-muted)]">
            {item.projectName}
          </span>
        </div>
        <span className="sm-status-pill">{titleCase(item.status)}</span>
      </div>
      <p className="sm-copy text-sm leading-7">{item.summary}</p>
      <div className="flex flex-wrap gap-2 text-xs text-[var(--sm-text-muted)]">
        <span>{item.threadCount} threads</span>
        <span>{item.taskSummary}</span>
        <span>{item.lastTouchedLabel}</span>
      </div>
    </InteractiveCard>
  );
}

function TraceItem({ item }: { item: TraceEventItemModel }) {
  return (
    <InteractiveCard isEmphasized={item.isEmphasized}>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--sm-text-muted)]">
        <span className="sm-label">{item.originLabel}</span>
        <span>{item.timestampLabel}</span>
      </div>
      <p className="text-sm font-semibold text-[var(--sm-text-strong)]">
        {item.summary}
      </p>
      <div className="flex flex-wrap gap-2 text-xs text-[var(--sm-text-muted)]">
        <span>{item.projectName}</span>
        <span>{item.eventType}</span>
        <span>{item.category}</span>
        <span>{item.nodeCategory}</span>
        <span>{item.fileChangeLabel}</span>
      </div>
    </InteractiveCard>
  );
}

function SessionThreadCard({
  item,
  onSelect
}: {
  item: SessionThreadItemModel;
  onSelect: (threadId: string) => void;
}) {
  return (
    <InteractiveCard
      isActive={item.isActive}
      isEmphasized={item.isActive}
      onClick={() => onSelect(item.threadId)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <span className="sm-label">Thread</span>
          <span className="text-sm font-semibold text-[var(--sm-text-strong)]">
            {item.title}
          </span>
        </div>
        <span className="sm-status-pill">{titleCase(item.status)}</span>
      </div>
      <p className="sm-copy text-sm leading-7">{item.summary}</p>
      <div className="flex flex-wrap gap-2 text-xs text-[var(--sm-text-muted)]">
        <span>{item.updatedAtLabel}</span>
        <span>{item.taskCount} tasks</span>
        <span>{item.eventCount} events</span>
        <span>{item.fileChangeCount} file changes</span>
      </div>
    </InteractiveCard>
  );
}

function SessionTaskCard({ item }: { item: SessionTaskItemModel }) {
  return (
    <article className="sm-session-task">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <span className="sm-label">Task</span>
          <span className="text-sm font-semibold text-[var(--sm-text-strong)]">
            {item.title}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-[var(--sm-text-muted)]">
          <span className="sm-status-pill">{titleCase(item.status)}</span>
          <span className="sm-chip sm-chip--subtle">{titleCase(item.priority)}</span>
        </div>
      </div>
      <p className="sm-copy text-sm leading-7">{item.summary}</p>
      <p className="text-xs text-[var(--sm-text-muted)]">{item.updatedAtLabel}</p>
    </article>
  );
}

function FileChangeCard({ item }: { item: SessionFileChangeItemModel }) {
  return (
    <article className="sm-session-file-change">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <span className="sm-label">{titleCase(item.changeType)}</span>
          <span className="text-sm font-semibold text-[var(--sm-text-strong)] break-all">
            {item.path}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-[var(--sm-text-muted)]">
          <span>{item.languageLabel}</span>
          <span>{item.updatedAtLabel}</span>
        </div>
      </div>
      <p className="sm-copy text-sm leading-7">{item.summary}</p>
      <p className="text-xs text-[var(--sm-text-muted)]">{item.eventSummary}</p>
    </article>
  );
}

function SessionContextCard({
  item,
  actions
}: {
  item: SessionContextLinkModel;
  actions: SubMindShellActions;
}) {
  function handleClick() {
    if (item.kind === "action") {
      actions.onSelectAction(item.targetId);
      actions.onPrimaryScreenChange("actions");
      return;
    }

    if (item.kind === "guidance") {
      actions.onSelectGuidance(item.targetId);
      actions.onPrimaryScreenChange("guidance");
      return;
    }

    actions.onSelectMemory(item.targetId);
    actions.onPrimaryScreenChange("memory");
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      data-tone={item.tone}
      className={getToneCardClasses(
        {
          id: item.id,
          label: titleCase(item.kind),
          title: item.title,
          body: item.summary,
          tone: item.tone
        },
        "support",
        false,
        true,
        "sm-session-context-card"
      )}
    >
      <p className="sm-tone-card__label">{titleCase(item.kind)}</p>
      <h3 className="sm-display sm-tone-card__title">{item.title}</h3>
      <p className="sm-tone-card__body">{item.summary}</p>
      <div className="flex flex-wrap gap-2 text-xs text-[rgba(244,238,255,0.72)]">
        <span>{item.meta}</span>
        <span>Open {titleCase(item.kind)}</span>
      </div>
    </button>
  );
}

function MemoryCard({
  card,
  onSelect
}: {
  card: MemoryCardModel;
  onSelect: (memoryId: string) => void;
}) {
  return (
    <InteractiveCard
      isActive={card.isActive}
      isEmphasized={card.isEmphasized}
      onClick={() => onSelect(card.memoryId)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <span className="sm-label">Memory</span>
          <span className="text-base font-semibold text-[var(--sm-text-strong)]">
            {card.summary}
          </span>
        </div>
        <span className="sm-status-pill">{titleCase(card.status)}</span>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-[var(--sm-text-muted)]">
        <span>{card.projectName}</span>
        <span>{card.bucket}</span>
        <span>{card.confidenceLabel}</span>
        <span>{card.freshnessLabel}</span>
        <span>{card.curationLabel}</span>
        <span>{card.provenanceLabel}</span>
        {card.isPinned ? <span>pinned</span> : null}
      </div>
      <p className="text-xs text-[var(--sm-text-muted)]">{card.changeLabel}</p>
    </InteractiveCard>
  );
}

function GuidanceCard({
  card,
  onSelect
}: {
  card: GuidanceCardModel;
  onSelect: (guidanceId: string) => void;
}) {
  return (
    <InteractiveCard
      isActive={card.isActive}
      isEmphasized={card.isEmphasized}
      onClick={() => onSelect(card.guidanceId)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <span className="sm-label">Guidance</span>
          <span className="text-base font-semibold text-[var(--sm-text-strong)]">
            {card.title}
          </span>
        </div>
        <span className="sm-status-pill">{titleCase(card.state)}</span>
      </div>
      <p className="sm-copy text-sm leading-7">{card.summary}</p>
      <div className="flex flex-wrap gap-2 text-xs text-[var(--sm-text-muted)]">
        <span>{card.projectName}</span>
        <span>{card.source}</span>
        <span>{card.confidenceLabel}</span>
        <span>{card.linkedMemoryLabel}</span>
        <span>{card.actionPressureLabel}</span>
      </div>
      <p className="text-xs text-[var(--sm-text-muted)]">{card.evidenceLabel}</p>
      <p className="text-xs text-[var(--sm-text-muted)]">{card.policyLabel}</p>
    </InteractiveCard>
  );
}

function ActionCard({
  card,
  onSelect
}: {
  card: ActionCardModel;
  onSelect: (actionId: string) => void;
}) {
  return (
    <InteractiveCard
      attention={["high", "critical"].includes(card.riskLevel)}
      isActive={card.isActive}
      isEmphasized={card.isEmphasized}
      onClick={() => onSelect(card.actionId)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <span className="sm-label">Action</span>
          <span className="text-base font-semibold text-[var(--sm-text-strong)]">
            {card.title}
          </span>
        </div>
        <span className="sm-status-pill sm-status-pill--attention">
          {titleCase(card.riskLevel)}
        </span>
      </div>
      <p className="sm-copy text-sm leading-7">{card.summary}</p>
      <div className="flex flex-wrap gap-2 text-xs text-[var(--sm-text-muted)]">
        <span>{card.projectName}</span>
        <span>{card.state}</span>
        <span>{card.owner}</span>
        <span>{card.contextLabel}</span>
        <span>{card.outcomeLabel}</span>
      </div>
    </InteractiveCard>
  );
}

function ScreenSwitcher({
  screens,
  onSelect
}: {
  screens: SubMindShellViewModel["contentHeader"]["screens"];
  onSelect: (screen: PrimaryScreen) => void;
}) {
  return (
    <nav className="sm-screen-switcher" aria-label="Primary screens">
      {screens.map((screen) => (
        <button
          key={screen.id}
          type="button"
          onClick={() => onSelect(screen.id)}
          className={cx(
            "sm-screen-switcher__button",
            screen.isActive && "sm-screen-switcher__button--active"
          )}
        >
          {titleCase(screen.label)}
        </button>
      ))}
    </nav>
  );
}

function renderDashboard(
  viewModel: SubMindShellViewModel,
  actions: SubMindShellActions
) {
  const mode = getDashboardMode(viewModel);
  const [sessionDetail, guidanceDetail, memoryDetail] =
    viewModel.dashboard.deepeningCards;

  return (
    <div data-dashboard-mode={mode} className="sm-dashboard-shell">
      <div
        className="sm-dashboard-primary"
      >
        <ToneCard
          card={viewModel.dashboard.recentActivity}
          size={mode === "focused" ? "detail" : "support"}
          emphasized={mode !== "unselected"}
          className="sm-dashboard-activity-card"
          onClick={() => actions.onPrimaryScreenChange("sessions")}
          actionLabel="Open Sessions"
        />
        <ToneCard
          card={viewModel.dashboard.needsAttention}
          size={mode === "focused" ? "detail" : "support"}
          emphasized
          className="sm-dashboard-attention-card"
          onClick={() => actions.onPrimaryScreenChange("actions")}
          actionLabel="Open Actions"
        />
      </div>

      <Surface
        variant={mode === "focused" ? "elevated" : "panel"}
        className="sm-dashboard-lower"
      >
        <div className="sm-dashboard-lower__header">
          <p className="sm-label">Lower Deepening Zone</p>
          <span
            className={cx(
              "sm-chip sm-chip--subtle",
              mode === "focused" && "sm-chip--focused",
              mode === "selected" && "sm-chip--selected"
            )}
          >
            {mode === "focused"
              ? "Project room"
              : mode === "selected"
                ? "Magnetized"
                : "Broad command center"}
          </span>
        </div>

        <div
          className="sm-dashboard-deepening sm-dashboard-deepening--triple"
        >
          <ToneCard
            card={sessionDetail}
            size="support"
            emphasized={mode === "focused"}
            className="sm-dashboard-session-card"
            onClick={() => actions.onPrimaryScreenChange("sessions")}
            actionLabel="Open Sessions"
          />
          <ToneCard
            card={guidanceDetail}
            size="detail"
            emphasized
            className="sm-dashboard-detail sm-dashboard-guidance-card"
            onClick={() => actions.onPrimaryScreenChange("guidance")}
            actionLabel="Open Guidance"
          />
          <ToneCard
            card={memoryDetail}
            size="support"
            className="sm-dashboard-memory-card"
            onClick={() => actions.onPrimaryScreenChange("memory")}
            actionLabel="Open Memory"
          />
        </div>
      </Surface>
    </div>
  );
}

function renderSessions(
  viewModel: SubMindShellViewModel,
  actions: SubMindShellActions
) {
  return (
    <div className="sm-sessions-layout">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="sm-label">Session Navigator</p>
          <span className="sm-chip sm-chip--subtle">
            {viewModel.sessions.sessions.length} visible
          </span>
        </div>
        {viewModel.sessions.sessions.map((item) => (
          <SessionCard
            key={item.sessionId}
            item={item}
            onSelect={actions.onSelectSession}
          />
        ))}
      </div>

      <div className="grid gap-4">
        <ToneCard card={viewModel.sessions.inspector} size="detail" emphasized />

        <Surface variant="muted" className="grid gap-3 p-3 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="sm-label">Threads</p>
            <span className="sm-chip sm-chip--subtle">
              {viewModel.sessions.threads.length} in session
            </span>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {viewModel.sessions.threads.map((item) => (
              <SessionThreadCard
                key={item.threadId}
                item={item}
                onSelect={actions.onSelectThread}
              />
            ))}
          </div>
        </Surface>

        <Surface variant="panel" className="grid gap-3 p-3 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="sm-label">Event Sequence</p>
            <span className="sm-chip sm-chip--subtle">
              {viewModel.sessions.traceItems.length} events
            </span>
          </div>
          {viewModel.sessions.traceItems.length > 0 ? (
            viewModel.sessions.traceItems.map((item) => (
              <TraceItem key={item.eventId} item={item} />
            ))
          ) : (
            <p className="sm-copy text-sm leading-7 text-[var(--sm-text-muted)]">
              No events were recorded for the current scope.
            </p>
          )}
        </Surface>

        <Surface variant="panel" className="grid gap-3 p-3 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="sm-label">File Changes</p>
            <span className="sm-chip sm-chip--subtle">
              {viewModel.sessions.fileChanges.length} changes
            </span>
          </div>
          {viewModel.sessions.fileChanges.length > 0 ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {viewModel.sessions.fileChanges.map((item) => (
                <FileChangeCard key={item.fileChangeId} item={item} />
              ))}
            </div>
          ) : (
            <p className="sm-copy text-sm leading-7 text-[var(--sm-text-muted)]">
              No file changes were captured for the current scope.
            </p>
          )}
        </Surface>

        <Surface variant="panel" className="grid gap-3 p-3 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="sm-label">Tasks</p>
            <span className="sm-chip sm-chip--subtle">
              {viewModel.sessions.tasks.length} in focus
            </span>
          </div>
          {viewModel.sessions.tasks.length > 0 ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {viewModel.sessions.tasks.map((item) => (
                <SessionTaskCard key={item.taskId} item={item} />
              ))}
            </div>
          ) : (
            <p className="sm-copy text-sm leading-7 text-[var(--sm-text-muted)]">
              No task structure is recorded for the current thread.
            </p>
          )}
        </Surface>
      </div>

      <div className="grid gap-4">
        <Surface variant="muted" className="grid gap-3 p-3 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="sm-label">Linked Context</p>
            <span className="sm-chip sm-chip--subtle">
              {viewModel.sessions.linkedContext.length} items
            </span>
          </div>
          {viewModel.sessions.linkedContext.length > 0 ? (
            viewModel.sessions.linkedContext.map((item) => (
              <SessionContextCard key={item.id} item={item} actions={actions} />
            ))
          ) : (
            <p className="sm-copy text-sm leading-7 text-[var(--sm-text-muted)]">
              No linked actions, guidance, or memory were found for the current trace.
            </p>
          )}
        </Surface>
      </div>
    </div>
  );
}

function renderMemory(
  viewModel: SubMindShellViewModel,
  actions: SubMindShellActions
) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-wrap items-center justify-between gap-2 md:col-span-2">
          <p className="sm-label">Memory Index</p>
          <span className="sm-chip sm-chip--subtle">
            {viewModel.memory.cards.length} items
          </span>
        </div>
        {viewModel.memory.cards.map((card) => (
          <MemoryCard
            key={card.memoryId}
            card={card}
            onSelect={actions.onSelectMemory}
          />
        ))}
      </div>
      <div className="grid gap-4">
        <Surface variant="panel" className="grid gap-3 p-3 md:p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
              <p className="sm-label">Memory Inspector</p>
              <h3 className="sm-display text-xl text-[var(--sm-text-strong)]">
                {viewModel.memory.inspector.title}
              </h3>
            </div>
            {viewModel.memory.inspector.memoryId ? (
              <div className="flex flex-wrap gap-2 text-xs text-[var(--sm-text-muted)]">
                <span className="sm-chip sm-chip--subtle">
                  {viewModel.memory.inspector.statusLabel}
                </span>
                <span className="sm-chip sm-chip--subtle">
                  {viewModel.memory.inspector.curationLabel}
                </span>
                {viewModel.memory.inspector.isPinned ? (
                  <span className="sm-chip sm-chip--selected">Pinned</span>
                ) : null}
              </div>
            ) : null}
          </div>
          <p className="sm-copy text-sm leading-7">
            {viewModel.memory.inspector.content}
          </p>
          <div className="grid gap-2 text-xs text-[var(--sm-text-muted)]">
            <span>{viewModel.memory.inspector.projectName}</span>
            <span>{viewModel.memory.inspector.bucketLabel}</span>
            <span>{viewModel.memory.inspector.confidenceLabel}</span>
            <span>{viewModel.memory.inspector.freshnessLabel}</span>
            <span>{viewModel.memory.inspector.provenanceSummary}</span>
            <span>{viewModel.memory.inspector.changeSummary}</span>
          </div>
        </Surface>

        <Surface variant="muted" className="grid gap-3 p-3 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="sm-label">Memory Curation</p>
            {viewModel.memory.isMutationPending ? (
              <span className="sm-chip sm-chip--attention">Saving...</span>
            ) : null}
          </div>
          <label className="grid gap-2">
            <span className="sm-label">Summary</span>
            <input
              value={viewModel.memory.draftSummary}
              onChange={(event) =>
                actions.onMemorySummaryDraftChange(event.target.value)
              }
              disabled={!viewModel.memory.inspector.memoryId || viewModel.memory.isMutationPending}
              className="sm-retained-input"
            />
          </label>
          <label className="grid gap-2">
            <span className="sm-label">Content</span>
            <textarea
              value={viewModel.memory.draftContent}
              onChange={(event) =>
                actions.onMemoryContentDraftChange(event.target.value)
              }
              disabled={!viewModel.memory.inspector.memoryId || viewModel.memory.isMutationPending}
              className="sm-retained-textarea"
            />
          </label>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <label className="grid gap-2">
              <span className="sm-label">Status</span>
              <select
                value={viewModel.memory.draftStatus}
                onChange={(event) =>
                  actions.onMemoryStatusDraftChange(
                    event.target.value as SubMindShellViewModel["memory"]["draftStatus"]
                  )
                }
                disabled={!viewModel.memory.inspector.memoryId || viewModel.memory.isMutationPending}
                className="sm-retained-input"
              >
                <option value="">Select status</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="stale">Stale</option>
                <option value="superseded">Superseded</option>
                <option value="draft">Draft</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--sm-text-body)]">
              <input
                type="checkbox"
                checked={viewModel.memory.draftIsPinned}
                onChange={(event) =>
                  actions.onMemoryPinnedDraftChange(event.target.checked)
                }
                disabled={!viewModel.memory.inspector.memoryId || viewModel.memory.isMutationPending}
              />
              Pin memory
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => actions.onSaveMemory("edited")}
              disabled={!viewModel.memory.inspector.memoryId || viewModel.memory.isMutationPending}
              className="sm-action-transition-button sm-action-transition-button--violet"
            >
              <span className="sm-action-transition-button__label">Save Edit</span>
              <span className="sm-action-transition-button__body">
                Persist the curated summary/content as edited retained knowledge.
              </span>
            </button>
            <button
              type="button"
              onClick={() => actions.onSaveMemory("confirmed")}
              disabled={!viewModel.memory.inspector.memoryId || viewModel.memory.isMutationPending}
              className="sm-action-transition-button sm-action-transition-button--plum"
            >
              <span className="sm-action-transition-button__label">Confirm Memory</span>
              <span className="sm-action-transition-button__body">
                Keep the current text, but confirm the memory as operator-validated.
              </span>
            </button>
          </div>
        </Surface>

        <Surface variant="panel" className="grid gap-3 p-3 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="sm-label">Linked Context</p>
            <span className="sm-chip sm-chip--subtle">
              {viewModel.memory.inspector.linkedContext.length} items
            </span>
          </div>
          {viewModel.memory.inspector.linkedContext.length > 0 ? (
            viewModel.memory.inspector.linkedContext.map((item) => (
              <SessionContextCard key={item.id} item={item} actions={actions} />
            ))
          ) : (
            <p className="sm-copy text-sm leading-7 text-[var(--sm-text-muted)]">
              No linked actions or guidance are currently attached to this memory.
            </p>
          )}
        </Surface>

        <Surface variant="panel" className="grid gap-3 p-3 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="sm-label">Source Events</p>
            <span className="sm-chip sm-chip--subtle">
              {viewModel.memory.inspector.sourceEvents.length} events
            </span>
          </div>
          {viewModel.memory.inspector.sourceEvents.length > 0 ? (
            viewModel.memory.inspector.sourceEvents.map((item) => (
              <TraceItem key={item.eventId} item={item} />
            ))
          ) : (
            <p className="sm-copy text-sm leading-7 text-[var(--sm-text-muted)]">
              No source events were captured for this memory yet.
            </p>
          )}
        </Surface>

        <Surface variant="panel" className="grid gap-3 p-3 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="sm-label">Source Files</p>
            <span className="sm-chip sm-chip--subtle">
              {viewModel.memory.inspector.sourceFiles.length} files
            </span>
          </div>
          {viewModel.memory.inspector.sourceFiles.length > 0 ? (
            <div className="grid gap-3">
              {viewModel.memory.inspector.sourceFiles.map((item) => (
                <FileChangeCard key={item.fileChangeId} item={item} />
              ))}
            </div>
          ) : (
            <p className="sm-copy text-sm leading-7 text-[var(--sm-text-muted)]">
              No concrete file changes are currently linked to this memory.
            </p>
          )}
        </Surface>

        <Surface variant="panel" className="grid gap-3 p-3 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="sm-label">What Changed</p>
            <span className="sm-chip sm-chip--subtle">
              {viewModel.memory.inspector.historyItems.length} events
            </span>
          </div>
          {viewModel.memory.inspector.historyItems.length > 0 ? (
            <div className="sm-action-history__list">
              {viewModel.memory.inspector.historyItems.map((item) => (
                <RetainedHistoryItem key={item.eventId} item={item} />
              ))}
            </div>
          ) : (
            <p className="sm-copy text-sm leading-7 text-[var(--sm-text-muted)]">
              No retained change history has been recorded for this memory yet.
            </p>
          )}
        </Surface>
      </div>
    </div>
  );
}

function renderGuidance(
  viewModel: SubMindShellViewModel,
  actions: SubMindShellActions
) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="sm-label">Guidance Queue</p>
          <span className="sm-chip sm-chip--subtle">
            {viewModel.guidance.cards.length} packages
          </span>
        </div>
        {viewModel.guidance.cards.map((card) => (
          <GuidanceCard
            key={card.guidanceId}
            card={card}
            onSelect={actions.onSelectGuidance}
          />
        ))}
      </div>
      <div className="grid gap-4">
        <ToneCard card={viewModel.guidance.posture} size="support" emphasized />
        <Surface variant="panel" className="grid gap-3 p-3 md:p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
              <p className="sm-label">Decision Inspector</p>
              <h3 className="sm-display text-xl text-[var(--sm-text-strong)]">
                {viewModel.guidance.inspector.title}
              </h3>
            </div>
            {viewModel.guidance.inspector.guidanceId ? (
              <div className="flex flex-wrap gap-2 text-xs text-[var(--sm-text-muted)]">
                <span className="sm-chip sm-chip--subtle">
                  {viewModel.guidance.inspector.stateLabel}
                </span>
                <span className="sm-chip sm-chip--subtle">
                  {viewModel.guidance.inspector.sourceLabel}
                </span>
              </div>
            ) : null}
          </div>
          <p className="sm-copy text-sm leading-7">
            {viewModel.guidance.inspector.summary}
          </p>
          <div className="grid gap-2 text-xs text-[var(--sm-text-muted)]">
            <span>{viewModel.guidance.inspector.projectName}</span>
            <span>{viewModel.guidance.inspector.confidenceLabel}</span>
            <span>{viewModel.guidance.inspector.evidenceSummary}</span>
            <span>{viewModel.guidance.inspector.policySummary}</span>
          </div>
          <div className="grid gap-2">
            <p className="sm-label">Rationale</p>
            <p className="sm-copy text-sm leading-7">
              {viewModel.guidance.inspector.rationale}
            </p>
          </div>
        </Surface>

        <Surface variant="muted" className="grid gap-3 p-3 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="sm-label">Linked Context</p>
            <span className="sm-chip sm-chip--subtle">
              {viewModel.guidance.inspector.linkedContext.length} items
            </span>
          </div>
          {viewModel.guidance.inspector.linkedContext.length > 0 ? (
            viewModel.guidance.inspector.linkedContext.map((item) => (
              <SessionContextCard key={item.id} item={item} actions={actions} />
            ))
          ) : (
            <p className="sm-copy text-sm leading-7 text-[var(--sm-text-muted)]">
              No linked memory or action context is attached to this guidance yet.
            </p>
          )}
        </Surface>

        <Surface variant="panel" className="grid gap-3 p-3 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="sm-label">Evidence Events</p>
            <span className="sm-chip sm-chip--subtle">
              {viewModel.guidance.inspector.evidenceEvents.length} events
            </span>
          </div>
          {viewModel.guidance.inspector.evidenceEvents.length > 0 ? (
            viewModel.guidance.inspector.evidenceEvents.map((item) => (
              <TraceItem key={item.eventId} item={item} />
            ))
          ) : (
            <p className="sm-copy text-sm leading-7 text-[var(--sm-text-muted)]">
              No evidence events are currently linked to this guidance package.
            </p>
          )}
        </Surface>

        <Surface variant="panel" className="grid gap-3 p-3 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="sm-label">Guidance History</p>
            <span className="sm-chip sm-chip--subtle">
              {viewModel.guidance.inspector.historyItems.length} events
            </span>
          </div>
          {viewModel.guidance.inspector.historyItems.length > 0 ? (
            <div className="sm-action-history__list">
              {viewModel.guidance.inspector.historyItems.map((item) => (
                <RetainedHistoryItem key={item.eventId} item={item} />
              ))}
            </div>
          ) : (
            <p className="sm-copy text-sm leading-7 text-[var(--sm-text-muted)]">
              No guidance history has been recorded for this package yet.
            </p>
          )}
        </Surface>
      </div>
    </div>
  );
}

function renderActions(
  viewModel: SubMindShellViewModel,
  actions: SubMindShellActions
) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="sm-label">Action Queue</p>
          <span className="sm-chip sm-chip--attention">
            {viewModel.actions.cards.length} active
          </span>
        </div>
        {viewModel.actions.cards.map((card) => (
          <ActionCard
            key={card.actionId}
            card={card}
            onSelect={actions.onSelectAction}
          />
        ))}
      </div>
      <div className="grid gap-4">
        <ToneCard card={viewModel.actions.posture} size="support" emphasized />
        <article
          data-tone={viewModel.actions.mainView.tone}
          className={getToneCardClasses(
            viewModel.actions.mainView,
            "detail",
            true,
            false,
            "sm-action-panel"
          )}
        >
          <div className="sm-action-panel__header">
            <div className="grid gap-1">
              <p className="sm-tone-card__label">{viewModel.actions.mainView.label}</p>
              <h3 className="sm-display sm-tone-card__title">
                {viewModel.actions.mainView.title}
              </h3>
            </div>
            {viewModel.actions.isMutationPending ? (
              <span className="sm-chip sm-chip--attention">Applying update</span>
            ) : null}
          </div>
          <p className="sm-tone-card__body">{viewModel.actions.mainView.body}</p>
          <div className="sm-action-panel__section">
            <span className="sm-label">Expected Outcome</span>
            <p className="sm-action-panel__copy">{viewModel.actions.expectedOutcome}</p>
          </div>
          <label className="sm-action-panel__section">
            <span className="sm-label">Actual Outcome</span>
            <textarea
              value={viewModel.actions.actualOutcome}
              onChange={(event) =>
                actions.onActionOutcomeDraftChange(event.target.value)
              }
              placeholder={viewModel.actions.actualOutcomePlaceholder}
              disabled={!viewModel.actions.activeActionId || viewModel.actions.isMutationPending}
              className="sm-action-panel__textarea"
            />
          </label>
          <div className="sm-action-panel__transitions">
            {viewModel.actions.transitionControls.length > 0 ? (
              viewModel.actions.transitionControls.map((control) => (
                <button
                  key={control.nextState}
                  type="button"
                  disabled={control.isDisabled || !viewModel.actions.activeActionId}
                  onClick={() =>
                    viewModel.actions.activeActionId &&
                    actions.onTransitionAction(
                      viewModel.actions.activeActionId,
                      control.nextState
                    )
                  }
                  className={cx(
                    "sm-action-transition-button",
                    control.tone === "plum" &&
                      "sm-action-transition-button--plum",
                    control.tone === "violet" &&
                      "sm-action-transition-button--violet",
                    control.tone === "amber" &&
                      "sm-action-transition-button--amber",
                    control.tone === "slate" &&
                      "sm-action-transition-button--slate"
                  )}
                >
                  <span className="sm-action-transition-button__label">
                    {viewModel.actions.isMutationPending &&
                    viewModel.actions.pendingActionTransition === control.nextState
                      ? `${control.label}...`
                      : control.label}
                  </span>
                  <span className="sm-action-transition-button__body">
                    {control.description}
                  </span>
                </button>
              ))
            ) : (
              <p className="sm-action-panel__empty">
                This action is already in a terminal state.
              </p>
            )}
          </div>
        </article>
        <article
          data-tone={viewModel.actions.inspector.tone}
          className={getToneCardClasses(
            viewModel.actions.inspector,
            "detail",
            false,
            false,
            "sm-action-panel sm-action-panel--audit"
          )}
        >
          <p className="sm-tone-card__label">{viewModel.actions.inspector.label}</p>
          <h3 className="sm-display sm-tone-card__title">
            {viewModel.actions.inspector.title}
          </h3>
          <p className="sm-tone-card__body">{viewModel.actions.inspector.body}</p>
          <div className="sm-action-history">
            <div className="sm-action-history__header">
              <p className="sm-label">Action History</p>
              <span className="sm-chip sm-chip--subtle">
                {viewModel.actions.historyItems.length} events
              </span>
            </div>
            {viewModel.actions.historyItems.length > 0 ? (
              <div className="sm-action-history__list">
                {viewModel.actions.historyItems.map((item) => (
                  <ActionHistoryItem key={item.eventId} item={item} />
                ))}
              </div>
            ) : (
              <p className="sm-action-panel__empty">
                No action history recorded yet.
              </p>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}

function renderActiveScreen(
  viewModel: SubMindShellViewModel,
  actions: SubMindShellActions
) {
  switch (viewModel.primaryScreen) {
    case "dashboard":
      return renderDashboard(viewModel, actions);
    case "sessions":
      return renderSessions(viewModel, actions);
    case "memory":
      return renderMemory(viewModel, actions);
    case "guidance":
      return renderGuidance(viewModel, actions);
    case "actions":
      return renderActions(viewModel, actions);
    default:
      return null;
  }
}

export function SubMindShell({
  viewModel,
  actions
}: SubMindShellProps) {
  const dashboardMode = getDashboardMode(viewModel);
  const workspaceVariant = dashboardMode === "focused" ? "elevated" : "panel";

  return (
    <div
      data-layout-mode={viewModel.layoutMode}
      className="min-h-dvh bg-[var(--sm-app-bg)] text-[var(--sm-text-body)]"
    >
      <div className="sm-shell-layout mx-auto flex min-h-dvh w-full max-w-[2400px] flex-col gap-3 p-3 sm:p-4 xl:p-4">
        <header className="sm-chrome overflow-hidden rounded-[1.6rem]">
          <div className="sm-command-strip">
            <div className="sm-command-strip__zone sm-command-strip__zone--left">
              <div className="sm-command-strip__brand">
                <span className="sm-label">Operator View</span>
                <h1 className="sm-display sm-command-strip__title text-[1.35rem] leading-none text-[var(--sm-text-strong)]">
                  {viewModel.commandStrip.title}
                </h1>
              </div>
              <p className="sm-command-strip__context">
                {viewModel.commandStrip.subtitle}
              </p>
            </div>

            <div className="sm-command-strip__zone sm-command-strip__zone--center sm-command-strip__controls">
              <div className="sm-segmented">
                {viewModel.commandStrip.layoutModes.map((layoutMode) => (
                  <button
                    key={layoutMode.id}
                    type="button"
                    onClick={() => actions.onLayoutModeChange(layoutMode.id)}
                    className={cx(
                      "sm-segmented__button",
                      layoutMode.isActive && "sm-segmented__button--active"
                    )}
                  >
                    {layoutMode.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={actions.onClearProjectSelection}
                disabled={!viewModel.commandStrip.canClearSelection}
                className="sm-chip sm-chip--subtle disabled:cursor-not-allowed disabled:opacity-40"
              >
                Clear
              </button>
            </div>

            <div className="sm-command-strip__zone sm-command-strip__zone--right sm-command-strip__metrics">
              {viewModel.commandStrip.metrics.map((metric) => (
                <div key={metric.label} className="sm-inline-metric">
                  <span className="sm-inline-metric__label">{metric.label}</span>
                  <span className="sm-inline-metric__value">{metric.value}</span>
                </div>
              ))}
            </div>
          </div>
        </header>

        <div
          data-dashboard-mode={dashboardMode}
          className="sm-operator-shell"
        >
          <aside className="sm-project-rail">
            <Surface
              variant={viewModel.scope === "project" ? "elevated" : "panel"}
              className="sm-project-rail-panel grid gap-4 p-4 md:p-[1.125rem]"
            >
              <div className="sm-project-rail__header">
                <p className="sm-label sm-project-rail__eyebrow">Projects</p>
                <h2 className="sm-display sm-project-rail__title">
                  {viewModel.projectStack.title}
                </h2>
                <p className="sm-project-rail__body">
                  {viewModel.projectStack.body}
                </p>
              </div>
              <div
                data-stack-mode={dashboardMode}
                className="sm-project-stack-list grid gap-3"
              >
                {viewModel.projectStack.cards.map((card) => (
                  <ProjectCard
                    key={`${card.projectId}:${card.state}`}
                    card={card}
                    onSelect={actions.onSelectProject}
                    onFocus={actions.onToggleProjectFocus}
                  />
                ))}
              </div>
            </Surface>

            {viewModel.projectStack.focusedContextCards.length > 0 ? (
              <Surface
                variant="muted"
                className="sm-project-companions grid gap-3 p-3 md:p-4"
              >
                <p className="sm-label">Focused Companions</p>
                {viewModel.projectStack.focusedContextCards.map((card) => (
                  <ToneCard key={card.id} card={card} size="support" emphasized />
                ))}
              </Surface>
            ) : null}
          </aside>

          <main className="sm-workspace-shell min-w-0">
            <Surface
              variant={workspaceVariant}
              className="sm-workspace-frame"
            >
              <div className="sm-workspace-header">
                <div className="sm-workspace-header-grid">
                  <div className="sm-workspace-heading">
                    <div className="sm-workspace-heading__meta">
                      <p className="sm-label">{viewModel.contentHeader.eyebrow}</p>
                      <span
                        className={cx(
                          "sm-chip sm-chip--subtle",
                          dashboardMode === "focused" && "sm-chip--focused",
                          dashboardMode === "selected" && "sm-chip--selected"
                        )}
                      >
                        {dashboardMode === "focused"
                          ? "Project room"
                          : dashboardMode === "selected"
                            ? "Magnetized"
                            : "Broad command center"}
                      </span>
                    </div>
                    <h2 className="sm-display sm-workspace-title text-[clamp(1.65rem,2vw,2.2rem)] leading-none text-[var(--sm-text-strong)]">
                      {viewModel.contentHeader.title}
                    </h2>
                    <p className="sm-workspace-heading__body">
                      {viewModel.contentHeader.description}
                    </p>
                  </div>
                  <div className="sm-workspace-switcher">
                    <ScreenSwitcher
                      screens={viewModel.contentHeader.screens}
                      onSelect={actions.onPrimaryScreenChange}
                    />
                  </div>
                </div>
              </div>

              <div
                data-primary-screen={viewModel.primaryScreen}
                className="sm-workspace-content"
              >
                {renderActiveScreen(viewModel, actions)}
              </div>
            </Surface>
          </main>
        </div>
      </div>
    </div>
  );
}
