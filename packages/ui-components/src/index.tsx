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

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function Surface({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "rounded-[28px] border border-slate-900/10 bg-white/80 shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur",
        className
      )}
    >
      {children}
    </section>
  );
}

function ToneCard({ card }: { card: ShellCardModel }) {
  const toneClass =
    card.tone === "plum"
      ? "bg-[#5d2f7a] text-white"
      : card.tone === "violet"
        ? "bg-[#7c5aa6] text-white"
        : card.tone === "amber"
          ? "bg-[#f3c55c] text-slate-950"
          : "bg-[#d9e4ea] text-slate-950";

  return (
    <article className={cx("grid gap-3 rounded-[26px] p-5", toneClass)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-75">
        {card.label}
      </p>
      <h3 className="font-['Aptos_Display','Bahnschrift','Segoe_UI',sans-serif] text-[clamp(1.4rem,2.4vw,2.2rem)] leading-none">
        {card.title}
      </h3>
      <p className="max-w-[52ch] text-sm leading-6 opacity-90">{card.body}</p>
    </article>
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

  return (
    <button
      type="button"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className={cx(
        "grid gap-3 rounded-[24px] border p-4 text-left transition duration-150 hover:-translate-y-0.5",
        card.state === "focused"
          ? "border-[#5d2f7a]/40 bg-[#f4ebff]"
          : card.state === "selected"
            ? "border-[#7c5aa6]/35 bg-[#f7f3ff]"
            : "border-slate-900/10 bg-white/85"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <span className="font-['Aptos_Display','Bahnschrift','Segoe_UI',sans-serif] text-lg leading-none">
            {card.name}
          </span>
          <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
            {card.description}
          </span>
        </div>
        <span className="rounded-full bg-slate-900/6 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
          {card.state}
        </span>
      </div>
      <p className="text-sm leading-6 text-slate-700">{card.summary}</p>
      <div className="flex flex-wrap gap-2">
        {card.descriptors.map((descriptor) => (
          <span
            key={descriptor}
            className="rounded-full bg-slate-900/[0.06] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600"
          >
            {descriptor}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        <span>{card.sessionCount} sessions</span>
        <span>{card.guidanceCount} guidance</span>
        <span>{card.actionCount} actions</span>
        <span>{card.lastTouchedLabel}</span>
      </div>
    </button>
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
    <button
      type="button"
      onClick={() => onSelect(item.sessionId)}
      className={cx(
        "grid gap-2 rounded-[20px] border p-4 text-left",
        item.isActive
          ? "border-[#5d2f7a]/35 bg-[#f4ebff]"
          : item.isEmphasized
            ? "border-[#7c5aa6]/25 bg-[#f9f5ff]"
            : "border-slate-900/10 bg-white"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <span className="font-semibold text-slate-950">{item.title}</span>
          <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
            {item.projectName}
          </span>
        </div>
        <span className="rounded-full bg-slate-900/6 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
          {item.status}
        </span>
      </div>
      <p className="text-sm leading-6 text-slate-700">{item.summary}</p>
      <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        <span>{item.threadCount} threads</span>
        <span>{item.taskSummary}</span>
        <span>{item.lastTouchedLabel}</span>
      </div>
    </button>
  );
}

function TraceItem({ item }: { item: TraceEventItemModel }) {
  return (
    <div
      className={cx(
        "grid gap-2 rounded-[20px] border p-4",
        item.isEmphasized
          ? "border-[#7c5aa6]/25 bg-[#f9f5ff]"
          : "border-slate-900/10 bg-white"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        <span>{item.projectName}</span>
        <span>{item.timestampLabel}</span>
      </div>
      <p className="text-sm font-semibold text-slate-950">{item.summary}</p>
      <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        <span>{item.category}</span>
        <span>{item.nodeCategory}</span>
      </div>
    </div>
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
    <button
      type="button"
      onClick={() => onSelect(card.memoryId)}
      className={cx(
        "grid gap-2 rounded-[20px] border p-4 text-left",
        card.isActive
          ? "border-[#5d2f7a]/35 bg-[#f4ebff]"
          : card.isEmphasized
            ? "border-[#7c5aa6]/25 bg-[#f9f5ff]"
            : "border-slate-900/10 bg-white"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-semibold text-slate-950">{card.summary}</span>
        <span className="rounded-full bg-slate-900/6 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
          {card.status}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        <span>{card.projectName}</span>
        <span>{card.bucket}</span>
        <span>{card.confidenceLabel}</span>
        <span>{card.freshnessLabel}</span>
        {card.isPinned ? <span>pinned</span> : null}
      </div>
    </button>
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
    <button
      type="button"
      onClick={() => onSelect(card.guidanceId)}
      className={cx(
        "grid gap-2 rounded-[20px] border p-4 text-left",
        card.isActive
          ? "border-[#5d2f7a]/35 bg-[#f4ebff]"
          : card.isEmphasized
            ? "border-[#7c5aa6]/25 bg-[#f9f5ff]"
            : "border-slate-900/10 bg-white"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-semibold text-slate-950">{card.title}</span>
        <span className="rounded-full bg-slate-900/6 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
          {card.state}
        </span>
      </div>
      <p className="text-sm leading-6 text-slate-700">{card.summary}</p>
      <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        <span>{card.projectName}</span>
        <span>{card.source}</span>
        <span>{card.linkedMemoryLabel}</span>
        <span>{card.actionPressureLabel}</span>
      </div>
    </button>
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
    <button
      type="button"
      onClick={() => onSelect(card.actionId)}
      className={cx(
        "grid gap-2 rounded-[20px] border p-4 text-left",
        card.isActive
          ? "border-[#5d2f7a]/35 bg-[#f4ebff]"
          : card.isEmphasized
            ? "border-[#7c5aa6]/25 bg-[#f9f5ff]"
            : "border-slate-900/10 bg-white"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-semibold text-slate-950">{card.title}</span>
        <span className="rounded-full bg-[#f3c55c]/65 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-950">
          {card.riskLevel}
        </span>
      </div>
      <p className="text-sm leading-6 text-slate-700">{card.summary}</p>
      <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        <span>{card.projectName}</span>
        <span>{card.state}</span>
        <span>{card.owner}</span>
        <span>{card.contextLabel}</span>
        <span>{card.outcomeLabel}</span>
      </div>
    </button>
  );
}

function ScreenHeader({
  title,
  body
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="grid gap-2 px-5 pt-5">
      <h3 className="font-['Aptos_Display','Bahnschrift','Segoe_UI',sans-serif] text-[1.5rem] leading-none text-slate-950">
        {title}
      </h3>
      <p className="max-w-[72ch] text-sm leading-6 text-slate-600">{body}</p>
    </div>
  );
}

function renderDashboard(viewModel: SubMindShellViewModel) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <ToneCard card={viewModel.dashboard.recentActivity} />
        <ToneCard card={viewModel.dashboard.needsAttention} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {viewModel.dashboard.deepeningCards.map((card) => (
          <ToneCard key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}

function renderSessions(
  viewModel: SubMindShellViewModel,
  actions: SubMindShellActions
) {
  return (
    <Surface className="grid gap-4 p-5">
      <ScreenHeader
        title={viewModel.sessions.title}
        body={viewModel.sessions.body}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
        <div className="grid gap-3">
          {viewModel.sessions.sessions.map((item) => (
            <SessionCard
              key={item.sessionId}
              item={item}
              onSelect={actions.onSelectSession}
            />
          ))}
        </div>
        <div className="grid gap-4">
          <ToneCard card={viewModel.sessions.inspector} />
          <div className="grid gap-3">
            {viewModel.sessions.traceItems.map((item) => (
              <TraceItem key={item.eventId} item={item} />
            ))}
          </div>
        </div>
      </div>
    </Surface>
  );
}

function renderMemory(
  viewModel: SubMindShellViewModel,
  actions: SubMindShellActions
) {
  return (
    <Surface className="grid gap-4 p-5">
      <ScreenHeader title={viewModel.memory.title} body={viewModel.memory.body} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <div className="grid gap-3 md:grid-cols-2">
          {viewModel.memory.cards.map((card) => (
            <MemoryCard
              key={card.memoryId}
              card={card}
              onSelect={actions.onSelectMemory}
            />
          ))}
        </div>
        <ToneCard card={viewModel.memory.inspector} />
      </div>
    </Surface>
  );
}

function renderGuidance(
  viewModel: SubMindShellViewModel,
  actions: SubMindShellActions
) {
  return (
    <Surface className="grid gap-4 p-5">
      <ScreenHeader
        title={viewModel.guidance.title}
        body={viewModel.guidance.body}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <div className="grid gap-3">
          {viewModel.guidance.cards.map((card) => (
            <GuidanceCard
              key={card.guidanceId}
              card={card}
              onSelect={actions.onSelectGuidance}
            />
          ))}
        </div>
        <div className="grid gap-4">
          <ToneCard card={viewModel.guidance.posture} />
          <ToneCard card={viewModel.guidance.inspector} />
        </div>
      </div>
    </Surface>
  );
}

function renderActions(
  viewModel: SubMindShellViewModel,
  actions: SubMindShellActions
) {
  return (
    <Surface className="grid gap-4 p-5">
      <ScreenHeader
        title={viewModel.actions.title}
        body={viewModel.actions.body}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <div className="grid gap-3">
          {viewModel.actions.cards.map((card) => (
            <ActionCard
              key={card.actionId}
              card={card}
              onSelect={actions.onSelectAction}
            />
          ))}
        </div>
        <div className="grid gap-4">
          <ToneCard card={viewModel.actions.posture} />
          <ToneCard card={viewModel.actions.mainView} />
          <ToneCard card={viewModel.actions.inspector} />
        </div>
      </div>
    </Surface>
  );
}

function renderActiveScreen(
  viewModel: SubMindShellViewModel,
  actions: SubMindShellActions
) {
  switch (viewModel.primaryScreen) {
    case "dashboard":
      return renderDashboard(viewModel);
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
  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top_left,rgba(124,90,166,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(93,47,122,0.16),transparent_34%),linear-gradient(180deg,#f5efe8_0%,#edf3f6_100%)] text-slate-950">
      <div className="mx-auto flex min-h-dvh max-w-[1800px] flex-col gap-4 p-4 lg:p-6">
        <header className="overflow-hidden rounded-[30px] border border-white/15 bg-[#111827] text-white shadow-[0_24px_60px_rgba(15,23,42,0.35)]">
          <div className="grid gap-5 p-5 lg:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-300">
                  Top Command Strip
                </div>
                <h1 className="font-['Aptos_Display','Bahnschrift','Segoe_UI',sans-serif] text-[clamp(2.2rem,5vw,4rem)] leading-none">
                  {viewModel.commandStrip.title}
                </h1>
                <p className="max-w-[72ch] text-sm leading-6 text-slate-300">
                  {viewModel.commandStrip.subtitle}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {viewModel.commandStrip.metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-100"
                  >
                    <span className="mr-2 text-slate-300">{metric.label}</span>
                    <span>{metric.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-start">
              <div className="grid gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">
                  Layout Mode
                </span>
                <div className="flex flex-wrap gap-2">
                  {viewModel.commandStrip.layoutModes.map((layoutMode) => (
                    <button
                      key={layoutMode.id}
                      type="button"
                      onClick={() => actions.onLayoutModeChange(layoutMode.id)}
                      className={cx(
                        "rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition",
                        layoutMode.isActive
                          ? "border-white/30 bg-white/20 text-white"
                          : "border-white/10 bg-white/8 text-slate-200 hover:bg-white/16"
                      )}
                    >
                      {layoutMode.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">
                  Project Actions
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={actions.onFocusSelectedProject}
                    disabled={!viewModel.commandStrip.canFocusSelectedProject}
                    className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-100 transition enabled:hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Focus Selected
                  </button>
                  <button
                    type="button"
                    onClick={actions.onClearProjectFocus}
                    disabled={!viewModel.commandStrip.canClearFocus}
                    className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-100 transition enabled:hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Clear Focus
                  </button>
                  <button
                    type="button"
                    onClick={actions.onClearProjectSelection}
                    disabled={!viewModel.commandStrip.canClearSelection}
                    className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-100 transition enabled:hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Clear Selection
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div
          className={cx(
            "grid gap-4",
            viewModel.layoutMode === "focus"
              ? "xl:grid-cols-[minmax(17rem,20rem)_1fr]"
              : "xl:grid-cols-[minmax(19rem,23rem)_1fr]"
          )}
        >
          <aside className="grid gap-4 self-start xl:sticky xl:top-6">
            <Surface className="grid gap-4 p-5">
              <div className="grid gap-2">
                <h2 className="font-['Aptos_Display','Bahnschrift','Segoe_UI',sans-serif] text-[1.7rem] leading-none text-slate-950">
                  {viewModel.projectStack.title}
                </h2>
                <p className="text-sm leading-6 text-slate-600">
                  {viewModel.projectStack.body}
                </p>
              </div>
              <div className="grid gap-3">
                {viewModel.projectStack.cards.map((card) => (
                  <ProjectCard
                    key={card.projectId}
                    card={card}
                    onSelect={actions.onSelectProject}
                    onFocus={actions.onToggleProjectFocus}
                  />
                ))}
              </div>
            </Surface>

            {viewModel.projectStack.focusedContextCards.map((card) => (
              <ToneCard key={card.id} card={card} />
            ))}
          </aside>

          <main className="grid gap-4">
            <Surface className="grid gap-4 p-5">
              <div className="grid gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  {viewModel.contentHeader.eyebrow}
                </p>
                <div className="grid gap-3 lg:flex lg:items-end lg:justify-between">
                  <div className="grid gap-2">
                    <h2 className="font-['Aptos_Display','Bahnschrift','Segoe_UI',sans-serif] text-[clamp(1.8rem,3vw,2.8rem)] leading-none text-slate-950">
                      {viewModel.contentHeader.title}
                    </h2>
                    <p className="max-w-[76ch] text-sm leading-6 text-slate-600">
                      {viewModel.contentHeader.description}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {viewModel.contentHeader.screens.map((screen) => (
                      <button
                        key={screen.id}
                        type="button"
                        onClick={() => actions.onPrimaryScreenChange(screen.id)}
                        className={cx(
                          "rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition",
                          screen.isActive
                            ? "border-[#5d2f7a]/25 bg-[#ede4fa] text-[#3c2253]"
                            : "border-slate-900/10 bg-white text-slate-600 hover:border-[#7c5aa6]/20 hover:bg-[#f8f4ff]"
                        )}
                      >
                        {screen.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Surface>

            {renderActiveScreen(viewModel, actions)}
          </main>
        </div>
      </div>
    </div>
  );
}
