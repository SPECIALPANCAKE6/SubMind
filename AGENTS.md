# AGENTS.md — SubMind Governing Guide

## Purpose
This file governs how Codex agents and helper subagents should build **SubMind**.

SubMind is a **Tauri desktop control plane** for Codex workflows:
- operator-first
- project-aware
- memory-backed
- guidance-aware
- action/audit capable
- structured as a **system**, not a pile of features

This document is intentionally opinionated. When in doubt, **follow this file**.

---

# 1. Product Identity

## What SubMind is
SubMind is:
- a **cognitive + operational observability layer** over Codex activity
- a **persistent intelligence/control plane**
- a **desktop operator console** with multiple views
- a system that helps users understand:
  - what happened
  - what changed
  - what SubMind believes
  - what guidance was generated
  - what actions need attention

## What SubMind is **not**
SubMind is **not**:
- a replacement for Codex Desktop
- a replacement for the Codex IDE extension
- a normal chat UI
- a generic enterprise dashboard
- a Git client clone
- a fake sci-fi toy with no real structure

## Golden rules
1. **Do not invent product behavior silently.**
2. **Follow locked schemas and scope rules strictly.**
3. **Prefer explicitness over cleverness.**
4. **Keep `apps/desktop` thin.**
5. **Model calls = cognition. Code = control.**
6. **Subagents = escalation, not default runtime dependency.**
7. **Operator View is the first-class experience in v1.**
8. **Build one coherent system, not disconnected screens.**

---

# 2. Architecture Direction

## Shell/runtime
SubMind uses a **Hybrid bridge architecture**:
- user experiences one desktop app
- internal systems remain separable:
  - GUI shell
  - Codex bridge
  - core orchestration
  - store/database
  - worker runtime

SubMind should feel like:
> one polished desktop application with separable internals

## Desktop stack
Locked:
- **Tauri**
- **React**
- **Tailwind CSS**
- **shadcn/ui** + custom components
- **Zustand** for UI/app state
- **TanStack Query** for async/data state
- **Drizzle + SQLite**

---

# 3. Scope Model

## Scope states
SubMind supports:
- **global**
- **project-focused**

## Project states
Project state is distinct from application scope.

### Selected project
A project can be **selected** while the app remains in **global scope**.

Selection means:
- emphasize this project
- keep the wider world visible
- bias content toward the selected project
- do **not** fully narrow the app

### Focused project
A project can be **focused**.

Focus means:
- application narrows into project scope
- all primary screens become project-specific
- cross-project content drops away from main content areas

## Key rule
**Selection does not equal focus.**

## Launch behavior
Open in the highest-confidence relevant state:
- **focused project** if strongly implied:
  - explicit project path
  - “Open project here”
  - opened from repo/workspace
  - a **very recently active** Codex thread strongly indicates that project
- **global + selected project** if there is a weaker/softer project signal
- **global + no selection** otherwise

---

# 4. Layout Modes

## v1 priority
**Operator View** first.

## Modes
- **Operator View**
- **Focus View**
- **Tab View**

### Operator View
- rich, high-density operator console
- multi-region composition
- persistent project awareness
- coolest / fullest version of the system

### Focus View
- calmer reduction of Operator View
- less density
- more collapsible/single-pane behavior
- same app, same structure, reduced visual load

### Tab View
- workspace-style
- tabs for main screens/context
- less simultaneous panel density
- familiar VS Code / browser mental model

---

# 5. Shell Layout Spec

## Shell philosophy
Persistent operator-console frame with stable context and swappable main content.

## Persistent shell regions in Operator View
- **Top Command Strip**
- **Project Stack** (persistent contextual spine, visually content-like)
- **Primary Screen Content Area**

## Not globally persistent
- no permanent shell-wide inspector region

## Support mechanisms
- right-edge utility drawer/panel support
- overlay layer for modals, command palette, notifications, etc.
- support surfaces may expand into main content temporarily

## Primary screen navigation
Separate two concepts:

### Layout mode switching
- subtle / utility-level
- lives in command strip or settings/utility area

### Primary screen switching
- Dashboard
- Sessions
- Memory
- Guidance
- Actions

Primary screen switching should be integrated near the **main content header**, not buried in Project Stack.

## Expandable support surfaces
These can take over the main content area:
- Projects
- Profile
- Settings

When closed, user returns to the previously active primary screen and scope.

---

# 6. Project Stack Spec

## Purpose
The Project Stack is a persistent contextual spine made of compact project cards.

It is not a generic sidebar.
It should feel like part of the board.

## Stack modes
- **compact**
- **expanded**
- **full project browser**

## Card states
- **unselected**
- **hovered**
- **selected**
- **focused**

## Behaviors

### Unselected
- compact
- readable
- stackable
- ambient project presence

Shows:
- project name
- compact descriptors
- light state/pulse hint
- maybe tiny summary line if space allows, but primarily compact

### Hovered
- subtle lift/emphasis
- maybe reveal quick affordances
- tactile, not jumpy

### Selected
- modest expansion / peek-open effect
- concise summary visible
- stronger accent treatment
- other cards remain visible but quieter

Meaning:
> I’m watching this project.

### Focused
- substantial expansion
- other project cards compress/drop away
- focused card becomes a project context block
- additional context cards appear

Meaning:
> I’m inside this project.

## Focused-context cards
Default v1 focused extra cards:
1. **Project Pulse**
2. **Project Context**

### Project Pulse
- recent activity
- session/guidance/action hints
- what’s moving right now

### Project Context
- concise project bio/identity
- key architecture notes / important memory hints
- “what this project is / what matters”

### Placement
Layout-dependent, but default:
- directly below the focused card

## Selection/focus transitions
- single click = select
- explicit action = focus
- unfocus returns to **global + selected** by default

## Badge/descriptor types in v1
Use visually distinct categories:

### Identity descriptors
Examples:
- `desktop app`
- `tauri`
- `typescript`
- `ai tooling`
- `operator-first`

Rules:
- short
- lightweight
- user-creatable
- expandable/clickable later

### State badges
Examples:
- `active`
- `recent`
- `needs attention`
- `new guidance`

### Small counters
Examples:
- actions
- guidance
- recent changes

Keep restrained. Do not overload cards.

---

# 7. Primary Screens

## Primary screens
- **Dashboard**
- **Sessions**
- **Memory**
- **Guidance**
- **Actions**

## Support/context surfaces
- Projects
- Profile
- Settings

Any support/context surface may expand into main content.

---

## 7.1 Dashboard
Dashboard is the **true home screen**.

It supports:
- **Global Dashboard**
- **Project Dashboard**

### Global / unselected
- broad command center
- all projects visible
- cross-project activity visible
- helps user decide what to focus on

### Global / selected
- global context preserved
- one project emphasized/magnetized
- selected project gets richer dashboard representation

### Focused
- single-project dashboard
- cross-project content removed from main content regions

### Core Dashboard zones
- Header / command strip
- Project Stack
- Recent Activity zone
- Needs Attention zone
- Lower Deepening zone

### Dashboard hierarchy
- Projects = identity/context star
- Activity = motion star
- Needs Attention = urgency star
- Lower Deepening zone = narrative/deepening star

### Lower Deepening zone
This is the dashboard’s story engine.
It can show:
- selected/focused project detail
- recommended next focus
- recent session summary
- key guidance snapshot
- key memory/architecture/gotcha hints

Do not let it become a junk drawer.

---

## 7.2 Sessions
Sessions is really:
**Sessions / Activity / Work Trace**

### Purpose
Answer:
- what happened?
- in which session?
- in which thread?
- for what task?
- what changed?
- what files were touched?
- what diffs resulted?
- what did SubMind derive from it?

### Structure
- **Work Navigator**
- **Activity Graph / Work Trace**
- **Context Inspector**

### Scope behavior
#### Global
- session-first
- project-level graph lanes
- broad observability

#### Selected
- selected project emphasized
- global context still visible
- selected project sessions/threads rise in importance

#### Focused
- project-only
- thread-first
- thread activity lanes expand
- no cross-project content in main content regions

### Work hierarchy
- Session
  - Thread
    - Task(s)

Tasks are subordinate to threads, not top-level graph lanes in v1.

### Graph type
The Sessions graph is:
> a time-based event-sequence graph with lanes and nodes

Not a metrics chart.

---

## 7.3 Memory
Memory is:
- structured archive
- living cognitive system
- evidence-backed belief store

### Structure
- **Bucket / View Navigator**
- **Memory Collection / Cards**
- **Memory Inspector / Evidence Panel**

### Buckets (all scopes)
- Project Context
- Architecture Notes
- Preferences
- Pending Items
- Gotchas / Constraints
- Workflow Patterns

### Smart views
These change how bucket contents are surfaced.
They do **not** create parallel memory modes.

Examples:
- Recent Changes
- Pinned
- Low Confidence
- Stale

### Scope behavior
#### Global / no selected project
Show:
- global memories
- cross-project beliefs
- profile-level beliefs
- minimal project memory highlights only

#### Global / selected
- selected project memory emphasized
- global memory becomes less dominant
- project memories linked to global memories should show that relationship

#### Focused
- project-specific memory world
- global inherited context may be linked, but should not dominate

### Memory card signals
Cards can show:
- summary/content
- bucket tag
- confidence cue
- freshness cue
- scope cue
- pinned/muted/edited markers
- provenance/source cue

### Editing
Editing is allowed, but carefully.

Edited memories must:
- be visibly marked as edited
- have lightweight history
- support revert later

### Memory status in v1
Include at least:
- active
- archived
- stale
- superseded
- draft/speculative

---

## 7.4 Guidance
Guidance is the transparent intervention surface.

### Purpose
Show:
- current candidate guidance
- recent guidance
- what got injected
- what was suggested/suppressed
- why
- what tuning/policy affected the result

### Structure
- **Guidance Feed / Candidate List**
- **Injected Guidance Main View**
- **Tuning / Decision Inspector**

### Core rule
**What got injected is the main story.**

### Feed
- current candidate first
- then recent guidance events
- groups by smart views
- navigation/history aid only
- least important region of the three

### Main view
- cards
- injected / suggested / suppressed all possible
- injected emphasized most
- concise rationale attached to each chunk

### Inspector
Shows:
- deeper why
- confidence
- sources
- policy/tuning context
- aggression mode
- omissions
- expandable tuning controls

### Tone
- transparent control room
- tactical intervention board
- slight recommendation-engine flavor

---

## 7.5 Actions
Actions is the inbox / approval / control / audit screen.

### Structure
- **Action Queue**
- **Action Main View**
- **Audit / Context Inspector**

### Queue feel
- inbox / IM-thread queue energy
- action cards with states
- pending / in-progress first
- recent completed/resolved after

### Main view
- action itself is the star
- clear user options
- concise but descriptive risk/context summary

### Inspector
Shows:
- what would happen / what did happen
- audit trail
- related session/thread/task/guidance/memory/files/diffs
- deeper risk/policy reasoning

### Tone
- approachable first
- serious on drill-down

---

# 8. Event Taxonomy and Sessions Graph

## Canonical event classes
- **lifecycle**
- **work_change**
- **guidance**
- **memory**
- **action**
- **subagent**
- **system_user**

These are the locked final event classes.

## Lane families
### v1
- `project` lanes in global/selected scope
- `thread` lanes in focused scope

### later
- `task` lanes

## Visual node categories
- `anchor`
- `change`
- `cognitive`
- `control`
- `delegation`
- `marker`

## Graph rules
- node-driven, not line-driven
- selective labels based on scope/importance/density
- low-importance events cluster in v1
- not every stored event becomes a visible graph node
- selection/focus changes rendering, not underlying event truth
- system/user events allowed, used sparingly

## Shared Event structure
Every Event should conceptually include:
- `id`
- `originType`
- `eventType`
- `category`
- `projectId`
- `sessionId?`
- `threadId?`
- `taskId?`
- `fileChangeId?`
- `guidanceItemId?`
- `actionItemId?`
- `memoryItemId?`
- `timestamp`
- `summary`
- structured `metadata/payload`
- `importance` may come later

## Event origins
- `codex`
- `submind`
- `subagent`
- `system`
- `user`

---

# 9. Core Data Model

## Identity / scope
- **Profile**
- **Project**

## Work trace
- **Session**
- **Thread**
- **Task**
- **Event**
- **FileChange**

## Cognitive / control
- **MemoryItem**
- **GuidanceItem**
- **ActionItem**

## Settings/config
- profile settings
- project settings

---

## 9.1 Profile
Lean-ish identity/settings entity with linked memory context.

Should include conceptually:
- identity
- auth/account linkage
- default settings
- ownership of many projects
- support for multiple profiles
- one primary profile common/default

Profile-bounded view scope by default.
Shared profile view can exist later.

Rich user/workstyle meaning belongs mostly in Memory, not raw Profile fields.

---

## 9.2 Project
Stable workspace/repo anchor with lightweight descriptive support.

Should include conceptually:
- identity
- profile ownership
- workspace/repo path
- git/repo info if repo
- timestamps
- lightweight descriptors/tags
- short editable bio/summary

Selected/focused state is **not** stored as core project data.

Project can link to richer meaning in Memory.

---

## 9.3 Session / Thread / Task
### Session
High-level work container for one project.
Contains many Threads.

### Thread
Concrete Codex-related work thread when possible.
Fallback abstraction only if needed.

### Task
Lightweight first-class entity in v1.
Subordinate to Thread.

### Relationships
- Project has many Sessions
- Session has many Threads
- Thread has many Tasks

### Direct `projectId`
Store direct `projectId` on:
- Session
- Thread
- Task
(and likely most other entities)

Rule:
- parent hierarchy is canonical
- duplicated scope IDs are convenience/query fields
- consistency must be validated on writes

### Titles/summaries
- generated first
- titles editable
- summaries generated/derived

### Status
Clear enough for UX, not a huge state-machine swamp.

---

## 9.4 FileChange
File-level work artifact.

Should include conceptually:
- `id`
- `projectId`
- `sessionId?`
- `threadId?`
- `taskId?`
- `path`
- `changeType`
- `summary`
- `diffPreview`
- `language?`
- `fileType`
- `gitRef` / related git metadata
- timestamps as needed

### Diff handling
v1:
- diff preview/summary stays on `FileChange`

Near future:
- may extract richer DiffSummary entity once patch/chunk workflows need it

---

## 9.5 MemoryItem
First-class retained belief/knowledge record.

Should include conceptually:
- identity/scope
- bucket
- content/summary
- status
- confidence
- freshness
- pin/mute flags
- edited flag
- timestamps
- lastConfirmedAt / archivedAt as needed
- authorship fields
- source/provenance refs
- links to other memory items
- lightweight edit history

### Scope
MemoryItem can be:
- global/profile-level
- project-level

### Must support
- inter-memory links
- project↔global links
- edited markers
- history/revert-friendly design

---

## 9.6 GuidanceItem
First-class guidance decision package.

### Shape
v1:
- one package/event containing multiple chunks and outcomes

### Includes
- scope/context
- chunk states:
  - candidate
  - injected
  - suggested
  - suppressed
- concise rationale per chunk
- linked MemoryItems
- linked Events
- policy/tuning snapshot
- authorship/origin
- editable/curated state

### Policy/tuning context
Store it in the entity.
UI can selectively show it.

---

## 9.7 ActionItem
First-class actionable/control/approval record.

### Includes
- scope/context
- title/summary
- state
- risk
- expectedOutcome
- actualOutcome
- authorship
- links to related entities
- timestamps
- lightweight history

### Risk fields in v1
- `riskLevel`
- `riskSummary`
- `riskFactors`

### Action states in v1
- pending
- in_progress
- approved
- rejected
- blocked
- resolved

### Outcome fields
Support both:
- `expectedOutcome`
- `actualOutcome`

Either may be nullable depending on state.
Preserving expected vs actual is useful for audit.

---

# 10. Worker Model

## Core worker philosophy
- deterministic code = control, validation, indexing, lifecycle, policy
- model calls = bounded judgment/synthesis
- subagents = escalation layer

Do not blur these casually.

---

## Worker families
1. ingestion / normalization
2. scope / state / lifecycle
3. work-trace synthesis
4. memory synthesis
5. guidance synthesis
6. action synthesis
7. project enrichment
8. later subagent escalation jobs

---

## Deterministic workers (v1)
Include conceptually:
- `codex_event_ingestor`
- `event_normalizer`
- `file_change_extractor`
- `launch_context_resolver`
- `scope_consistency_validator`
- `lifecycle_state_updater`
- `activity_graph_indexer`
- `memory_classifier`
- `memory_confidence_freshness_updater`
- `memory_history_manager`
- `guidance_policy_applier`
- `action_state_manager`

## Model-call workers (v1)
Include conceptually:
- `session_summarizer`
- `thread_summarizer`
- `task_synthesizer`
- `memory_extractor`
- `memory_linker`
- `guidance_candidate_builder`
- `guidance_ranker`
- `guidance_composer`
- `guidance_explainer` (or folded into composer initially)
- `action_enricher`
- `action_risk_assessor`
- `project_bio_summarizer`

## Later / v1.1 ideas
- `project_descriptor_suggester`
- `integration-troubleshooter` support paths
- `worker-auditor`
- richer `provenance_resolver`
- extracted diff-summary worker

---

## Relationship concern split
Do not overload `memory_linker`.

Use a conceptual split like:
- `memory_linker` → memory↔memory links
- `entity_link_resolver` → cross-entity links
- `provenance_resolver` → source/evidence chains

These can be partially folded early, but do not let one god-worker absorb everything.

---

# 11. Checkpoints

## Philosophy
Hybrid model:
- deterministic workers run immediately when useful
- model workers run on defined checkpoints / debounced windows / demand

## Checkpoint families
- **event checkpoint**
- **thread checkpoint**
- **session checkpoint**
- **guidance checkpoint**
- **action checkpoint**
- **project enrichment checkpoint**

## Event checkpoint
Runs immediately on meaningful new data.

## Thread checkpoint
Runs after short debounce / idle / key transitions.

## Session checkpoint
Runs after session close/idle/meaningful threshold.

## Guidance checkpoint
Runs when guidance context changes or guidance needs refresh.

## Action checkpoint
Runs when action-worthy conditions or state changes occur.

## Project enrichment checkpoint
Runs when project needs refreshed bio/context.

## Important
UI-only project focus/select state changes may trigger checkpoints or rerender logic, but do **not** need to become first-class work-trace events by default.

---

# 12. Subagents

## Starter set
- `repo-explorer`
- `design-reviewer`
- `doc-researcher`
- `test-auditor`

## Operating stance
Subagents are:
- semi-regular collaborators on medium/large tasks
- not required for the core runtime loop
- sometimes more involved depending on task
- higher-trust examples:
  - `repo-explorer`
  - `doc-researcher`

## Invocation rules
- main agent must explain why it invoked a subagent
- subagents may analyze, propose, and prepare
- execution should remain gated by the main agent and/or user approval
- do not spawn subagents for every tiny edit

## Best later additions
- `integration-troubleshooter`
- `worker-auditor`

---

# 13. Repo / Package Layout

## Monorepo
Use a **pnpm monorepo**.

## Recommended structure
```text
submind/
├─ apps/
│  └─ desktop/
├─ packages/
│  ├─ core/
│  ├─ protocol-codex/
│  ├─ store/
│  ├─ workers/
│  ├─ policy/
│  ├─ shared-schemas/
│  ├─ ui-state/
│  └─ ui-components/
├─ docs/
│  ├─ product/
│  ├─ architecture/
│  ├─ data-model/
│  └─ implementation/
├─ .codex/
│  ├─ agents/
│  └─ skills/
├─ scripts/
├─ package.json
├─ pnpm-workspace.yaml
└─ turbo.json
```

## Package responsibilities

### `apps/desktop`
Thin Tauri/React shell and view wiring only.

### `packages/shared-schemas`
Source of truth for entities, enums, worker I/O contracts, event taxonomy.

### `packages/store`
Drizzle schema, migrations, queries, persistence helpers.

### `packages/protocol-codex`
Bridge/app-server interaction, ingestion adapters, Codex-facing protocol logic.

### `packages/core`
Orchestration, checkpoint coordination, launch context logic, high-level flows.

### `packages/workers`
Deterministic and model-call workers, grouped by domain.

### `packages/policy`
Policy/scoring/aggression/risk and similar bounded logic.

### `packages/ui-state`
Zustand stores, TanStack Query helpers, shell/scope state.

### `packages/ui-components`
Reusable components, shell pieces, graph primitives, cards, badges, panels.

---

# 14. Naming Conventions

## Packages
- kebab-case

## Files
- explicit feature names
- avoid cute names

## Types/entities/components
- PascalCase

## Workers
- verb-driven names
- e.g. `session-summarizer`, `memory-extractor`

## Stores
- explicit feature-based names
- e.g. `project-context-store`, `shell-layout-store`

Do not use vague mystery-meat names.

---

# 15. Implementation Strategy

## Major rule
**Schema first.**
Not every tiny detail first, but the major skeleton first.

Then:
- shell
- screen skeletons
- real integration early once the receiving surfaces exist

## Build order
1. schema skeleton
2. shell skeleton
3. Project Stack + Dashboard
4. Sessions
5. Memory
6. Guidance
7. Actions
8. refinements / reductions / later expansions

## Data strategy
Use:
- minimal mock scaffolding
- real Codex ingestion as soon as schema and receiving shell/screen surfaces exist
- replace mocks quickly once real flows are ready

Do not build fake-data-only forever.

---

# 16. Testing Expectations

## Test strongly
- deterministic workers
- schema transitions
- scope consistency
- lifecycle transitions
- event projection rules
- memory history/edit flows
- guidance state logic
- action state/risk/history flows

## Integration-test
- ingestion → normalization
- worker checkpoint flows
- memory extraction/linking basics
- guidance pipeline
- action pipeline

## UI-test
- Project Stack state transitions
- global/selected/focused behavior
- screen rendering with fixtures
- shell expansion/return behavior

Prioritize deterministic logic and state integrity over polish-first testing.

---

# 17. Model Calls vs Subagents

## Deterministic code for:
- ingestion
- normalization
- indexing
- lifecycle updates
- policy enforcement
- history tracking
- consistency validation
- graph projection

## Model calls for:
- summarization
- extraction
- ranking
- composition
- enrichment
- linking
- risk explanation

## Subagents for:
- repo-wide exploration
- design review
- docs verification
- test auditing
- clear escalation cases

## Core rule
**Model calls by default. Subagents for clear escalation cases.**

Do not make subagents a required dependency for the core loop.

---

# 18. Anti-Overbuild Rules

Do **not** build yet:
- full theme system
- 3D memory graph
- full subagent management UI
- task lanes in the Sessions graph
- giant Git client features
- giant settings matrix
- overgrown worker splitting with no payoff
- heavy auth/account complexity
- polished Focus/Tab mode before Operator is strong

Build enough for:
- one powerful Operator shell
- five strong screens
- coherent schema
- meaningful worker flow
- explainable intelligence
- future-friendly architecture

---

# 19. Product Invention Policy

## Very important
Do **not** silently freelance product behavior.

When something is unspecified:
- follow locked principles
- make only small, reversible assumptions
- surface important assumptions clearly
- prefer TODOs/placeholders/flags over silent invention

### Allowed
Reasonable implementation inference.

### Not allowed
Broad product improvisation that changes behavior or architecture without explicit approval.

---

# 20. Final Directive

Build SubMind as a **system**, not a collection of cool-looking panels.

Every component should reinforce:
- clarity
- observability
- control
- intelligence
- trust
- continuity

If something feels like a gimmick, reduce it.
If something feels generic, sharpen it.
If something feels like a feature instead of part of a coherent system, rethink it.

SubMind should feel like:
- a real operator console
- a living cognitive layer
- a serious tool with style

Not costume software.
