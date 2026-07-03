---
version: "alpha"
name: "SubMind Operator Console"
description: "A dense dark desktop control-plane design system for project-aware Codex workflow observability, memory, guidance, and action review."
colors:
  primary: "#7041A3"
  on-primary: "#F4EEFF"
  primary-container: "#392159"
  on-primary-container: "#F4EEFF"
  secondary: "#560B62"
  on-secondary: "#F4EEFF"
  secondary-container: "#2D1C48"
  on-secondary-container: "#D4C9EB"
  tertiary: "#D7A24C"
  on-tertiary: "#2B1A00"
  tertiary-container: "#4A2F12"
  on-tertiary-container: "#F6D498"
  background: "#070B14"
  on-background: "#D4C9EB"
  surface: "#221737"
  surface-dim: "#171322"
  surface-bright: "#4D2A75"
  surface-container-lowest: "#0E1322"
  surface-container-low: "#171322"
  surface-container: "#221737"
  surface-container-high: "#2D1C48"
  surface-container-highest: "#392159"
  on-surface: "#F4EEFF"
  on-surface-variant: "#D4C9EB"
  muted: "#9F95BB"
  dim: "#7A7194"
  outline: "#B7A7DF"
  outline-variant: "#C9B8EF"
  shell: "#0F1320"
  shell-border: "#AC9AD6"
  selected: "#7041A3"
  focused: "#560B62"
  selected-glow: "#835BD6"
  focused-glow: "#6B0B7F"
  plum: "#560B62"
  violet: "#5B3195"
  slate: "#594E7F"
  amber: "#744A12"
  grid-line: "#F4EEFF"
typography:
  display-xl:
    fontFamily: "Sora"
    fontSize: 38px
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: -0.03em
  display-lg:
    fontFamily: "Sora"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: -0.03em
  display-md:
    fontFamily: "Sora"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: "Sora"
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.035em
  headline-md:
    fontFamily: "Sora"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.03em
  title-md:
    fontFamily: "IBM Plex Sans"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: 0em
  body-lg:
    fontFamily: "IBM Plex Sans"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0.01em
  body-md:
    fontFamily: "IBM Plex Sans"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0.01em
  body-sm:
    fontFamily: "IBM Plex Sans"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0.01em
  label-md:
    fontFamily: "IBM Plex Sans"
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.17em
  label-sm:
    fontFamily: "IBM Plex Sans"
    fontSize: 10px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.12em
  metric-sm:
    fontFamily: "IBM Plex Sans"
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: 0.12em
  control-sm:
    fontFamily: "IBM Plex Sans"
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0.08em
spacing:
  "0": 0px
  "1": 4px
  "2": 6px
  "3": 8px
  "4": 10px
  "5": 12px
  "6": 14px
  "7": 16px
  "8": 18px
  "9": 20px
  "10": 24px
  "11": 28px
  "12": 32px
  "16": 40px
  "20": 48px
  shell-gutter: 16px
  panel-padding: 18px
  card-gap: 12px
  record-padding: 16px
  dashboard-gap: 13px
rounded:
  none: 0px
  xs: 8px
  sm: 16px
  DEFAULT: 16px
  md: 18px
  lg: 20px
  xl: 22px
  "2xl": 25px
  "3xl": 27px
  full: 9999px
radii:
  chip: "{rounded.full}"
  control: "{rounded.full}"
  metric: "{rounded.sm}"
  record-card: "{rounded.lg}"
  project-card: "{rounded.xl}"
  tone-card: "{rounded.2xl}"
  surface: "{rounded.3xl}"
  startup-panel: 32px
shadows:
  sm: "0 12px 24px rgba(5, 7, 14, 0.22)"
  md: "0 18px 44px rgba(5, 7, 14, 0.34)"
  lg: "0 28px 80px rgba(4, 7, 15, 0.42)"
  active-control: "0 8px 20px rgba(10, 12, 22, 0.24)"
  interactive-hover: "0 22px 42px rgba(5, 7, 14, 0.34)"
  focused-ring: "0 0 0 1px rgba(223, 211, 255, 0.18), 0 0 0 4px rgba(125, 83, 188, 0.12)"
  selected-glow: "0 24px 38px rgba(131, 91, 214, 0.26)"
  focused-glow: "0 26px 44px rgba(107, 11, 127, 0.34)"
elevation:
  base:
    backgroundColor: "{colors.background}"
    borderColor: "transparent"
    shadow: "none"
  shell:
    backgroundColor: "{colors.shell}"
    borderColor: "rgba(172, 154, 214, 0.18)"
    shadow: "{shadows.lg}"
    backdropBlur: 24px
  panel:
    backgroundColor: "{colors.surface}"
    borderColor: "rgba(183, 167, 223, 0.14)"
    shadow: "{shadows.md}"
  elevated:
    backgroundColor: "{colors.surface-container-highest}"
    borderColor: "rgba(201, 184, 239, 0.28)"
    shadow: "{shadows.md}"
  attention:
    backgroundColor: "{colors.tertiary-container}"
    borderColor: "rgba(215, 162, 76, 0.26)"
    shadow: "{shadows.sm}"
motion:
  duration-affordance: 140ms
  duration-fast: 150ms
  duration-base: 160ms
  easing-standard: "ease"
  lift-subtle: -1px
  lift-card: -2px
  project-shift-selected: 9px
  project-shift-focused: 6px
components:
  app-background:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-background}"
    typography: "{typography.body-md}"
  shell-chrome:
    backgroundColor: "{colors.shell}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.2xl}"
    padding: "{spacing.7}"
  surface-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-variant}"
    rounded: "{rounded.3xl}"
    padding: "{spacing.panel-padding}"
  surface-muted:
    backgroundColor: "{colors.surface-dim}"
    textColor: "{colors.on-surface-variant}"
    rounded: "{rounded.3xl}"
    padding: "{spacing.panel-padding}"
  surface-elevated:
    backgroundColor: "{colors.surface-container-highest}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.3xl}"
    padding: "{spacing.panel-padding}"
  command-nav-button:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.control-sm}"
    rounded: "{rounded.full}"
    padding: "9px 15px"
  command-nav-button-active:
    backgroundColor: "rgba(101, 67, 156, 0.42)"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.full}"
    padding: "9px 15px"
  segmented-button:
    backgroundColor: "transparent"
    textColor: "{colors.dim}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: "6px 12px"
  segmented-button-active:
    backgroundColor: "rgba(255, 255, 255, 0.08)"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.full}"
    padding: "6px 12px"
  chip-default:
    backgroundColor: "rgba(255, 255, 255, 0.04)"
    textColor: "{colors.on-surface-variant}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: "6px 11px"
  chip-selected:
    backgroundColor: "rgba(112, 65, 163, 0.24)"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: "6px 11px"
  chip-focused:
    backgroundColor: "rgba(86, 11, 98, 0.4)"
    textColor: "{colors.on-secondary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: "6px 11px"
  chip-attention:
    backgroundColor: "rgba(215, 162, 76, 0.18)"
    textColor: "{colors.on-tertiary-container}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: "6px 11px"
  status-pill:
    backgroundColor: "rgba(255, 255, 255, 0.04)"
    textColor: "{colors.on-surface-variant}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    height: 30px
    padding: "6px 11px"
  status-pill-attention:
    backgroundColor: "rgba(215, 162, 76, 0.18)"
    textColor: "{colors.on-tertiary-container}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    height: 30px
    padding: "6px 11px"
  tone-card-plum:
    backgroundColor: "{colors.plum}"
    textColor: "{colors.on-secondary}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.2xl}"
    padding: "{spacing.8}"
  tone-card-violet:
    backgroundColor: "{colors.violet}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.2xl}"
    padding: "{spacing.8}"
  tone-card-slate:
    backgroundColor: "{colors.slate}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.2xl}"
    padding: "{spacing.8}"
  tone-card-amber:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.on-tertiary-container}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.2xl}"
    padding: "{spacing.8}"
  project-card-unselected:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.on-surface-variant}"
    rounded: "{rounded.xl}"
    padding: "12px 13px 12px 15px"
  project-card-selected:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
    rounded: "{rounded.xl}"
    padding: "12px 13px 12px 15px"
  project-card-focused:
    backgroundColor: "{colors.focused}"
    textColor: "{colors.on-secondary}"
    rounded: "{rounded.xl}"
    padding: "12px 13px 12px 15px"
  record-card:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.on-surface-variant}"
    rounded: "{rounded.lg}"
    padding: "{spacing.record-padding}"
  record-card-active:
    backgroundColor: "{colors.focused}"
    textColor: "{colors.on-secondary}"
    rounded: "{rounded.lg}"
    padding: "{spacing.record-padding}"
  input-retained:
    backgroundColor: "rgba(12, 15, 28, 0.32)"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "14px 16px"
  action-transition-plum:
    backgroundColor: "{colors.plum}"
    textColor: "{colors.on-secondary}"
    typography: "{typography.control-sm}"
    rounded: "{rounded.sm}"
    padding: "12px 13px"
  action-transition-violet:
    backgroundColor: "{colors.violet}"
    textColor: "{colors.on-primary}"
    typography: "{typography.control-sm}"
    rounded: "{rounded.sm}"
    padding: "12px 13px"
  action-transition-amber:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.on-tertiary-container}"
    typography: "{typography.control-sm}"
    rounded: "{rounded.sm}"
    padding: "12px 13px"
  action-transition-slate:
    backgroundColor: "{colors.slate}"
    textColor: "{colors.on-surface}"
    typography: "{typography.control-sm}"
    rounded: "{rounded.sm}"
    padding: "12px 13px"
---

## Overview

SubMind should look like a serious desktop operator console: compact, persistent, and information-rich, with enough visual style to feel like a living cognitive layer rather than a generic admin dashboard. The identity is dark, glassy, and system-oriented. It uses layered violet and plum surfaces, quiet text contrast, compact labels, and restrained amber attention signals.

The interface should feel project-aware at all times. A persistent project stack anchors the left side of the experience, while the main workspace carries Dashboard, Sessions, Memory, Guidance, and Actions. The design goal is not decoration. It is visual observability: a user should be able to scan scope, project state, recent motion, retained knowledge, guidance, action pressure, and runtime provenance without hunting.

SubMind is also cross-runtime by design. Codex and Copilot activity should feel like two feeds inside one operator console, not two separate products jammed together. When both runtimes point at the same workspace, the UI should present one project with merged activity rather than duplicate same-name projects.

## Colors

The palette is a deep violet-black control-room palette. The app background is almost black blue, with panel surfaces moving through muted raisin, violet, and plum. Primary violet marks selected or magnetized state. Focused project state moves darker and more saturated, using plum as a "inside this project" signal. Amber is reserved for attention, risk, approvals, and pending control work.

- Use near-black blue for the page canvas and shell foundation.
- Use violet and plum as structural state colors, not as generic decoration.
- Use amber sparingly for action pressure, risk, or needs-attention states.
- Text should be soft lavender-white rather than pure white except where strong emphasis is needed.
- Borders should be low-opacity lavender, creating edge definition without turning the UI into a wireframe.

## Typography

SubMind uses two sans families with separate jobs. Sora is the display voice for product identity, card titles, screen titles, and project names. IBM Plex Sans is the operational voice for body copy, labels, metrics, controls, and dense metadata.

Headings are compact and slightly tight, with negative letter spacing on Sora titles to make the console feel designed rather than stock. Body copy should remain readable at small sizes, usually 13px to 15px with generous line height. Labels and status text are uppercase, semibold, and widely tracked. They should act as navigational instrumentation, not prose.

## Layout

Operator View is the visual baseline. The layout is a persistent command strip above a two-region board: project stack on the left, primary workspace on the right. The project stack is not a generic sidebar. It should read as a contextual spine made of compact project cards that can select, focus, compress, and reveal companions.

The workspace is dense but ordered. Dashboard compositions favor a top activity and attention band with a lower deepening/story zone. Sessions, Memory, Guidance, and Actions should use queue/list areas paired with an inspector or main view. Keep the density high, but keep rhythm stable: small gaps inside cards, medium gaps between cards, and a consistent panel gutter around major surfaces.

Use responsive reductions by compressing density and hiding secondary card details before changing the core hierarchy. The app should still feel like the same operator console on narrower widths.

Scope language should stay explicit in the UI. Global state with no dominant project is the broad command center. Global state with one selected project is magnetized: that project gets stronger center-of-gravity treatment while the wider board stays visible. Focused state is the project room: trace, memory, guidance, and action narrow around one project while the stack remains present.

## Cross-Runtime Identity

Project identity should be anchored by canonical workspace identity, not by project name alone and not by whatever path string happened to arrive from a runtime source. Equivalent paths such as native Windows paths, `file://` URIs, WSL `/mnt/c/...` paths, and VS Code remote workspace URIs should collapse into the same project if they point to the same workspace.

This matters visually as much as it matters technically. The project stack should never show multiple cards with the same apparent project just because Codex and Copilot reported different path formats. Dashboard counts, session lists, guidance, and action pressure should all roll up under the unified project anchor.

If a runtime chat has no resolvable real workspace, the UI may surface it under a stable fallback bucket, but that bucket must not visually collide with a real project.

## Elevation & Depth

Depth is built from dark translucent layers, soft shadows, subtle borders, and small hover lifts. Shell surfaces use a blurred glass treatment; cards use gradient-like tonal shifts and diffused black-blue shadows. The effect should be tactile but grounded.

There are four practical depth levels:

- Base: fixed dark canvas with subtle radial light and a faint grid/noise impression.
- Shell: command strip and high-level frame, strongest blur and largest shadow.
- Panel: main surfaces and project rail containers, rounded with lavender borders.
- Active/elevated: selected cards, focused project cards, active records, and main action panels with brighter borders and stronger glow.

Do not use hard drop shadows, bright outlines, or light-mode card conventions. Elevation should feel like layered instrumentation inside a dark room.

## Shapes

The shape language is rounded and soft but not playful. Chips, pills, segmented controls, and state badges are fully rounded. Cards and panels use large radii, usually 18px to 27px, with the largest radius reserved for shell and major surfaces. Keep nested surfaces visually disciplined: cards can sit inside panels, but avoid card-on-card decoration for its own sake.

Rounded corners should support tactility and scanability. The UI should never feel like generic bubbly SaaS. Use large radii on structural containers, full pills for metadata, and tighter 16px radii for action buttons and input fields.

## Components

### Command Strip

The command strip is a compact top control region. It carries the product name, scope context, layout mode controls, and metrics. It should be visually quieter than the main workspace but always readable. Controls are pill-based and utility-level, not hero actions.

Command-strip metrics are not just inert labels. They can carry compact reversible actions, especially around scope. The active-project metric may flip into a clear-selection or exit-focus affordance on hover/focus. This should feel like instrument-panel interaction, not like a large obvious button.

### Project Stack

Project cards are the strongest stateful component. Unselected cards are compact and calm. Selected cards shift slightly and brighten with violet accents to mean "watching this project." Focused cards become deeper plum blocks with stronger glow and companion context cards below them. Single click selection and explicit focus behavior should remain visually distinct.

Project cards are aggregation surfaces, not source-specific buckets. If Codex and Copilot threads map to the same canonical workspace, they belong to the same project card, the same activity rollup, and the same selected/focused project experience.

### Tone Cards

Tone cards are summary, posture, or narrative cards. Use plum for urgent cognition or active project pressure, violet for guidance and selected emphasis, slate for neutral support, and amber for risk or attention. They should use Sora titles, compact uppercase labels, body copy capped to a few lines, and optional small fact pills.

Tone cards can also carry compact structured details. Small fact pills and short detail tiles are part of the scanning model: they let a user absorb counts, status, evidence, or provenance without opening a deeper surface. Cards may also act as launch surfaces into Sessions, Guidance, Memory, or Actions.

### Dashboard Cards

The dashboard should behave like a story engine, not a pile of summaries. The top band carries Recent Activity and Needs Attention as the motion and urgency stars. The lower deepening zone carries Recent Session, Guidance Snapshot, and Architecture / Memory as narrative launch surfaces.

Dashboard cards should adapt to scope posture. In the broad command center they stay cross-project and comparative. In magnetized state they visibly weight the selected project more heavily while still acknowledging the wider board. In the project room they should feel more inward-looking, with stronger borders, richer context, and language that confirms the user is inside one active project space.

The lower deepening zone should always surface one of three things clearly:
- the most concrete recent work trace
- the next likely intervention or guidance
- the architectural or retained memory context that should shape the next step

### Record Cards

Sessions, threads, memory items, guidance items, action items, tasks, and file changes use record cards. These cards should be denser than tone cards and rely on labels, status pills, and metadata rows. Active records can deepen to plum. Attention records use amber border/glow, not a full amber flood.

Thread record cards in Sessions need one more explicit signal: runtime origin. A user should be able to tell at a glance whether a thread came from Codex or Copilot without opening the trace. Place a compact origin pill in the thread-card header, adjacent to the status pill. If a thread ever contains mixed runtime provenance, surface that explicitly rather than silently picking one label.

### Memory Surface

Memory is no longer just a list-plus-inspector. The screen should read as a retained-context workbench with three layers:

- Memory Inspector hero: the currently selected memory with project tag, status/curation/pin chips, confidence and freshness support tiles, and a visible change summary.
- Memory Curation panel: summary/body editing, status control, pin control, and explicit save-edit vs confirm-memory actions.
- Memory Board: a lower deepening surface containing the memory index plus supporting evidence columns such as linked context, source events, source files, and what changed.

This screen should feel evidence-backed and operator-editable at the same time. Retained knowledge is not just displayed. It is reviewed, curated, and traced back to supporting events and file changes.

### Pills, Chips, And Badges

Pills are a core SubMind signal. Use them for scope, source, status, curation state, confidence, counters, and attention markers. They should be small, uppercase, and stable in size. Do not hide important provenance or state exclusively in an inspector when it can be shown as a compact badge in the list or card header.

Runtime source is one of the provenance signals that should be present directly on list cards. `Codex` and `Copilot` should read as first-class pills in Sessions thread headers; the trace can deepen that story, but it should not be the first place a user learns where a thread came from.

### Inputs And Action Controls

Inputs live inside retained memory and action workflows. They use dark blue-black fills, lavender borders, soft focus rings, and no bright white backgrounds. Action transition buttons are compact stacked controls with a title and a short explanatory line. Their tone should match the outcome: plum for approve/confirm, violet for block/hold, amber for reject/risk, slate for resolve/close.

## Do's and Don'ts

- Do keep Operator View dense, structured, and scan-friendly.
- Do keep selected project and focused project visually distinct.
- Do use amber only for attention, risk, and action pressure.
- Do use pills for compact state and provenance signals.
- Do unify equivalent Codex and Copilot workspaces into one project presentation.
- Do show thread origin directly on the thread card with a runtime pill.
- Do preserve the language distinction between broad command center, magnetized selection, and project room.
- Do let dashboard and memory surfaces carry concrete evidence, facts, and launch actions rather than only plain summary text.
- Do preserve the left project stack as contextual spine, not a generic navigation rail.
- Do make inspectors and queues feel connected through shared tokens, tone cards, and record cards.
- Don't turn SubMind into a chat UI, a generic enterprise dashboard, or a decorative sci-fi skin.
- Don't use bright neon, pure black/white contrast, or random accent colors outside the token palette.
- Don't make every card elevated; reserve stronger glow for focused, selected, active, or attention states.
- Don't split one real project into multiple same-name cards because runtime paths differ.
- Don't bury primary screen switching in the project stack.
- Don't hide Codex vs Copilot provenance only inside the trace or inspector.
- Don't flatten focused state into the same language or visual weight as global selection.
- Don't use fake decorative panels when a screen needs real trace, memory, guidance, or action structure.
