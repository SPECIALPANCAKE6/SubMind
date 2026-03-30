# AGENTS.md — SubMind Codex Agent Guide

## Purpose
This file defines how Codex agents (and subagents) should build SubMind.
It encodes architecture, behavior rules, priorities, and constraints.

---

# Core Philosophy

SubMind is:
- an **operator-first control plane**
- a **cognitive + operational observability system**
- a **persistent intelligence layer over Codex activity**

## Golden Rules

1. **Do not invent product behavior silently**
2. **Follow defined schemas and architecture strictly**
3. **Prefer explicitness over cleverness**
4. **Build thin UI, strong data + workers underneath**
5. **Model calls = cognition, code = control**
6. **Subagents = escalation, not default**

---

# Monorepo Structure

```
submind/
  apps/
    desktop/
  packages/
    core/
    protocol-codex/
    store/
    workers/
    policy/
    shared-schemas/
    ui-state/
    ui-components/
  .codex/
    agents/
    skills/
  docs/
```

## Rules
- `apps/desktop` must stay **thin**
- All logic lives in `packages/*`
- `shared-schemas` is the **source of truth**

---

# Core Entities (DO NOT ALTER CASUALLY)

- Profile
- Project
- Session
- Thread
- Task
- Event
- FileChange
- MemoryItem
- GuidanceItem
- ActionItem

Changes to these require:
→ design-reviewer subagent

---

# Event Taxonomy (LOCKED)

```
lifecycle
work_change
guidance
memory
action
subagent
system_user
```

---

# Workers

## Deterministic Workers
- ingestion
- normalization
- lifecycle updates
- policy enforcement
- indexing
- validation

## Model Workers
- summarization
- extraction
- ranking
- composition
- linking
- enrichment

## Rule
Never mix deterministic control logic with model reasoning.

---

# Checkpoints

## Event checkpoint
Runs immediately on new data.

## Thread checkpoint
Runs after short idle.

## Session checkpoint
Runs after session completes.

## Guidance checkpoint
Runs when context changes.

## Action checkpoint
Runs when risk/control events appear.

---

# Subagents

## Starter Set
- repo-explorer
- design-reviewer
- doc-researcher
- test-auditor

## Behavior Rules
- Subagents assist, not replace main agent
- Must justify invocation
- Prefer read/analyze → propose → THEN execute
- Execution should be gated

## Future
- integration-troubleshooter
- worker-auditor

---

# UI Shell Rules

Operator View:
- persistent project awareness
- central multi-panel composition

Focus View:
- reduced density

Tab View:
- workspace-style navigation

## Important
Do NOT overbuild UI early.

---

# Project Stack Rules

States:
- unselected
- selected
- focused

Behavior:
- single click = select
- explicit action = focus

---

# Implementation Strategy

## Phase Order
1. Schemas
2. Shell
3. Project Stack + Dashboard
4. Sessions
5. Memory
6. Guidance
7. Actions

## Data Strategy
- minimal mocks
- integrate real Codex data ASAP

---

# Testing Rules

Must test:
- deterministic workers
- schema transitions
- state changes
- event projection

---

# Anti-Overbuild Rules

DO NOT build yet:
- theme systems
- 3D graphs
- full subagent UI
- task lanes in graph
- complex settings

---

# Decision Discipline

If unsure:
1. Check schema
2. Check worker model
3. Check product intent
4. Ask before inventing

---

# Final Directive

Build SubMind as a **system**, not a set of features.

Every component must reinforce:
- clarity
- observability
- control
- intelligence

If something feels like a "feature" instead of part of a system — rethink it.

