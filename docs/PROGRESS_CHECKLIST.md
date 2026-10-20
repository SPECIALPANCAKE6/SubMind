# SubMind Progress & Task Checklist

*Generated 2026-10-19. Sources: 94 real Codex threads captured live via
`submind-runtime` (13 SubMind-specific, Apr–Sep 2026), 14 git commits,
docs (README, DESIGN.md, AGENTS.md, DECISION_MODEL_INTEGRATION.md), and
live verification (typecheck, tests, capture) on top-ison.*

## Milestone 1 — Foundation: DONE

- [X] pnpm monorepo (13 packages), `tsc -b` clean, vitest green
- [X] Apache 2.0 license
- [X] `@submind/protocol-muse` merged (PR #1, Oct 18 2026)

## Milestone 2 — Real data ingestion: DONE (proven live Oct 19)

- [X] Rust runtime reads `~/.codex` (SQLite index + JSONL rollouts)
- [X] Copilot runtime reads `~/.copilot`
- [X] Protocol normalizers: codex / copilot / hermes / mcp / muse
- [X] Headless `submind-runtime` binary (`capture` / `serve` modes)
- [X] Live proof: 94 Codex threads + 1 Copilot thread normalized to
  16 projects / 94 sessions / 257 events
- [X] Project identity reconciliation (cross-platform paths,
  Codex-vs-Copilot cwd merging) — the May "project grouping" fix

## Milestone 3 — Operator console: DONE (surfaces)

- [X] React shell, v1 visual system, DESIGN.md
- [X] Dashboard / Sessions / Guidance / Actions screens
- [X] Settings page (persisted)
- [X] Project search + external API (MCP bridge, `serve` mode)
- [X] Hermes MCP support

## Milestone 4 — The brain: IN PROGRESS

The first checkpoint execution path is now implemented and wired to the
native context-model provider. Triggering is debounced on new observed work.
Validated memory and guidance output is persisted as reviewable drafts and
candidates; it is not automatically activated or injected.

- [x] Model-worker checkpoint executor and native provider adapter.
- [x] Debounced event/thread triggers, session-close checkpoints, and
  evidence-driven guidance/action refreshes, with explicit immediate and
  debounced trigger APIs.
- [x] Checkpoint runs persisted as auditable `model-checkpoint-run` events.
- [x] Source-validated model memory drafts and guidance candidates persisted
  for review; generated proposals are not auto-injected or activated.
- [x] Dedicated generation controls for memory/task and guidance checkpoints;
  accept/dismiss memory drafts, approve/suppress guidance candidates, and
  accept/reject generated tasks with persisted review events.
- [x] Task synthesis from explicit intended, ongoing, blocked, and completed
  work evidence; multiple proposed Tasks can belong to one Thread and persist
  with source-event provenance.
- [x] Explicit, persisted operator eligibility for future context bundles.
  New model proposals are excluded until separately enabled; eligible Tasks
  and Guidance are projected as context candidates in both TypeScript and
  native Rust.
- [x] Reversible memory curation and Task/Guidance review history, guarded
  against undoing over a later proposal change.
- [x] Platform-neutral active-session delivery adapter contract with separate
  request/delivered/failed audit events; desktop controls clearly report that
  no harness adapter is currently registered.
- [x] Checkpoint pipeline composing trigger coordinator, executor scheduling,
  result persistence (audited even on persistence failure), and a delivery
  sink that never pushes unreviewed proposals.
- [x] Durable scheduled/debounced trigger queue across desktop restarts
  (`checkpoint_trigger_queue` in SQLite; replayed on startup; at-least-once,
  triggers older than 24h are dropped).
- [x] Hermes active-session delivery adapter (`createHermesSessionDeliveryAdapter`
  in `@submind/protocol-hermes`) over the Hermes API server's
  `POST /api/sessions/{id}/chat`.
- [x] Register the Hermes adapter in the desktop via native commands, with an
  in-app Settings panel (base URL, allow-remote, write-only API key stored in a
  native-only file; env vars override). Not yet validated against a live
  Hermes server.
- [ ] Register a real active-session delivery adapter for a supported harness.
- [ ] Decision-model integration (Decider-2b / Jev). Design doc only;
  5 phases, none started.

## Milestone 5 — Operations: PARTIAL

- [X] PR #1 merged on GitHub
- [ ] Push local work (`f35163a`) to GitHub — declined Oct 18, Addison
  will push from the laptop
- [ ] Scheduled capture — the ingestion valve is proven but not left
  open; no daemon or cron runs it today
- [ ] Model endpoint on Tailscale address — open question (Hako config
  vs SignalStack `.env`)

## Thread-by-thread cross-reference (Codex, SubMind project)

| Date       | Thread                                   | Outcome                                        |
| ---------- | ---------------------------------------- | ---------------------------------------------- |
| 2026-04-15 | Inspect page issues                      | Fixed — console renders                       |
| 2026-05-04 | Fix project grouping                     | Landed — project-identity reconciliation      |
| 2026-05-13 | Create DESIGN.md                         | Landed — root DESIGN.md                       |
| 2026-05-13 | "I thought we were using real data?"     | Landed — capture proven live Oct 19           |
| 2026-07-07 | Project search + external API            | Landed — search + MCP bridge + serve          |
| 2026-07-08 | Hermes MCP support                       | Landed — protocol-hermes                      |
| 2026-07-10 | Platform-agnostic projects               | Landed — path normalization                   |
| 2026-07-25 | Create commits                           | Done                                           |
| 2026-08-25 | Settings page                            | Landed — persisted settings                   |
| 2026-08-25 | Reconcile Codex/Copilot paths            | Landed — project-identity                     |
| 2026-09-02 | Hop in as agent via MCP                  | Landed — MCP bridge                           |
| 2026-09-12 | SUBMIND_CHAT_TRANSCRIPT.md               | Reference doc, no build                        |
| 2026-09-13 | Restructure as cross-agent control plane | In progress — runtime-native Rust layer (Oct) |

## The one-paragraph read

SubMind has a working observability pipeline, operator console, and an initial
native-backed checkpoint cognition loop. New observed work can now trigger
debounced event/thread workers, and completed sessions trigger a session
checkpoint; runs are recorded for audit. Durable scheduling, applying
generated memory/guidance proposals, semantic task synthesis, and the
decision-model integration remain open work in Milestone 4.
