import {
  useEffect,
  useRef,
  type MouseEvent,
  type ReactNode
} from "react";
import type {
  ActionCardModel,
  GuidanceCardModel,
  LayoutMode,
  MemoryCardModel,
  PrimaryScreen,
  ProjectStackCardModel,
  SessionListItemModel,
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
  onSelectMemory: (memoryId: string) => void;
  onSelectGuidance: (guidanceId: string) => void;
  onSelectAction: (actionId: string) => void;
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
  const toneClasses = cx(
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
    onClick && "sm-tone-card--interactive",
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
        <span className="sm-label">{item.projectName}</span>
        <span>{item.timestampLabel}</span>
      </div>
      <p className="text-sm font-semibold text-[var(--sm-text-strong)]">
        {item.summary}
      </p>
      <div className="flex flex-wrap gap-2 text-xs text-[var(--sm-text-muted)]">
        <span>{item.category}</span>
        <span>{item.nodeCategory}</span>
      </div>
    </InteractiveCard>
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
        {card.isPinned ? <span>pinned</span> : null}
      </div>
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
        <span>{card.linkedMemoryLabel}</span>
        <span>{card.actionPressureLabel}</span>
      </div>
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
    <div className="grid gap-4 lg:grid-cols-[minmax(20rem,0.9fr)_minmax(0,1.1fr)]">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="sm-label">Session Queue</p>
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
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="sm-label">Recent Activity</p>
            <span className="sm-chip sm-chip--subtle">
              {viewModel.sessions.traceItems.length} events
            </span>
          </div>
          {viewModel.sessions.traceItems.map((item) => (
            <TraceItem key={item.eventId} item={item} />
          ))}
        </div>
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
      <ToneCard card={viewModel.memory.inspector} size="detail" />
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
        <ToneCard card={viewModel.guidance.inspector} size="detail" />
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
        <ToneCard card={viewModel.actions.mainView} size="detail" emphasized />
        <ToneCard card={viewModel.actions.inspector} size="detail" />
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
