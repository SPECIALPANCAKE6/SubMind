# Provider-neutral continuity restructuring

## Findings and decisions

The September 13 transcript and the "Compare XIRP And Submind" conversation were reviewed as proposals. Live code established the starting point. Existing uncommitted Settings and project-alias work was preserved.

- Shared entities already described work, memory, guidance and actions, but event origins privileged Codex. New observations use `agent` plus `metadata.harnessId`; `codex` remains valid for retained records. Harness and model vendor are different concepts. Project IDs remain workspace based.
- Codex, Copilot and Hermes now implement `AgentAdapter` in shared schemas. Legacy normalization entry points delegate to these adapters. File formats, timestamps, source IDs and missing-workspace fallbacks remain adapter responsibilities.
- Core now coordinates observations with independent failures and coalesced refreshes; desktop provides transport bindings. Bootstrap no longer labels every active thread as Codex.
- Native readers and the HTTP context engine moved from desktop to `packages/runtime-native`, with small Tauri wrappers. Its headless capture/API host supports verification, not agent execution.
- SQLite refresh previously replaced history with a limited recent feed. Refresh now reconciles and upserts the union, preserves curated memories and evidence, and removes only superseded identity aliases after replacement rows exist. A missing runtime marker no longer authorizes deletion. This additive compatibility migration keeps existing tables and IDs; provenance and delivery evidence use existing JSON metadata.
- Existing retained-memory generation is deterministic work-trace summarization, not semantic model extraction. Confidence is heuristic. Confirmed/edited content survives refresh. Context audit events do not become evidence for new memories.
- High risk previously generated `injected` guidance without delivery. New derived guidance is suggested. Context response preparation, transport, self-reported consumer and unverified consumption are separate evidence. Later events in the requested thread yield temporal correlation, never claims of causality or benefit.
- Bounded model ranking/composition remains in workers and its native equivalent. Scope validation, redaction and budget enforcement remain deterministic. The two language implementations require parity checks; they are not one code implementation.
- Selection and focus, five primary screens, aliases and settings semantics remain intact. Guidance shows delivery/outcome evidence. No provider/workspace/execution entity hierarchy was added.

## Capability boundary

| Integration | Observation | Context delivery | Execution |
| --- | --- | --- | --- |
| Codex | Existing native history reader and normalization | General API/MCP pull when configured | None |
| Copilot | Existing native VS Code history reader and normalization | General API/MCP pull when configured | None |
| Hermes | Existing feed normalization; no native discovery here | General API/MCP consumer when configured | None |
| Claude / Gemini / other | No native history adapter implemented | Compatible configured API/MCP clients; live use unverified | None |

Observation does not imply context push, messages, approval hooks or execution. Context-service capabilities are independent of observation. Consumer names are self-reported metadata, not authenticated identity.

## Verification

- `npm test`: 80 tests passed across 12 suites, including cross-adapter continuity, schema/parent scope, dangling task evidence, persistence validation with retained parents, identity migration, curation, five-screen rendering and selection/focus behavior. TypeScript and production browser builds passed again after persistence validation changed.
- `npm run build`: TypeScript project-reference build passed.
- `npm run desktop:browser:build`: final production browser build passed (209 modules).
- `cargo test --manifest-path packages/runtime-native/Cargo.toml`: five native context tests passed, including redaction, valid model candidate IDs, first-item budget enforcement and exact audit persistence.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`: Tauri host compiled and passed its empty test targets. This is compilation evidence, not an interactive native UI test. A fresh ignored `CARGO_TARGET_DIR` avoided stale OneDrive cache timeouts.
- `npm run context:mcp:build` and `npm run context:mcp:verify`: standalone packaging and smoke verification passed. Stale generated MCP dependencies were moved into ignored artifacts and regenerated.
- Native capture read real local Codex history. The stable VS Code user-history directory is absent. Follow-up inspection found 32 chat-session JSONL files in VS Code Insiders workspace storage, which the current reader does not discover. Parsing and cross-harness continuity using that history remain to be verified. No Hermes installation was found in the previously checked location.
- `node scripts/demonstrate-continuity.mjs artifacts/continuity-stdio-final artifacts/continuity-capture/codex.json`: passed using real Codex history and an explicitly labelled later Hermes feed fixture. The actual native HTTP server and a separate MCP stdio process returned retained evidence. The isolated database contains one project, 15 threads, 272 events and 19 memories. The response held seven memory items / 2,360 estimated tokens. Both context audit records survived another refresh. SQLite integrity is `ok`; all retained memory evidence references resolve.
- The demonstration report is in `artifacts/continuity-stdio-final/report.json`. The helper processes exited successfully. No live user database was modified. Neither standard Windows SubMind database path exists on this host; retained-data compatibility was verified with the legacy SQLite migration tests and the isolated real-history demonstration.

## Requirement evidence

The prior completion claim was premature. The original demonstration used a second harness fixture. Follow-up verification now uses real Copilot and Codex history, with API/MCP delivery exercised by a demonstration client. Live agent consumption remains unverified. Native observation for Claude/Gemini and semantic memory extraction are still absent, as described below.

### Real-history follow-up

The Copilot native reader now discovers both stable VS Code and VS Code Insiders. It preserves session IDs and keeps the newest observation when a session has been copied between channels. A fresh capture read 34 Copilot sessions. The SubMind session had no request evidence, so the real-history demonstration used Oikoscape, where both captures contain substantive work. No project paths or aliases were invented to make the sources match.

`node scripts/demonstrate-continuity.mjs artifacts/continuity-real-pair artifacts/continuity-insiders-capture/codex.json artifacts/continuity-insiders-capture/copilot.json oikoscape` passed. It verifies a Codex task starts after the earlier Copilot work, retrieves prior Copilot event evidence, and exercises authenticated native HTTP plus a separate MCP stdio process. The resulting isolated database has one project, 33 threads, 522 events and 39 memories. Six context items used 1,734 estimated tokens. Both supply audit records survived refresh; SQLite integrity and all memory evidence references passed. Report: `artifacts/continuity-real-pair/report.json`. The helper exited successfully.

This is cross-harness continuity over real observations and supported delivery transports. It is not evidence that a live coding agent consumed the returned text or that the context improved its outcome. Native tests and Tauri compilation passed after discovery changed. Final repeat verification after persistence validation passed at `artifacts/continuity-audit-final/report.json`, with the same counts and integrity results. MCP packaging and smoke verification passed again.

The restructuring completion scope is the existing integrations, shared control/data boundary, retained-data compatibility, and demonstrated continuity loop. The transcript's broader roadmap was evaluated rather than treated as an implementation checklist: native observation for every named harness, semantic belief extraction, automatic context push, and agent execution are not being claimed. Compatible consumers use the same API/MCP context contract independently of whether SubMind has a history reader for them.

| Requirement | Evidence |
| --- | --- |
| Existing integrations behind one boundary | All three protocol exports delegate to their typed adapters; core coordinates their observation sources; desktop uses those sources and a neutral trace envelope. |
| Observation separate from delivery/execution | Independent capability fields; observation adapters advertise no delivery or execution; general context-service capabilities are separate; no agent executor added. |
| Retained data and project identity | SQLite migration and continuity tests preserve older sessions, events, curation and aliases even with a missing runtime marker; writes validate merged parent scope before changing stored work; demonstration integrity and reference checks pass. |
| Capture, retain, retrieve, supply, audit, outcomes | Real Copilot reader to SQLite to a later real Codex task to native API/MCP stdio; durable exact supply audit; fixture test records only later same-thread evidence with unverified consumption/usefulness. |
| Scope and five screens | Existing UI state/component regression suites pass; selection remains global emphasis and focus narrows project scope. |
| Thin desktop and bounded cognition | Tauri startup/commands delegate to runtime-native; TypeScript desktop delegates collection to core. Models rank/compose bounded candidates; deterministic code controls persistence, scope, redaction, budgets and outcome correlation. |
| No speculative product expansion | Existing entity hierarchy retained. No coding-agent execution, worktree manager, remote control or new primary screen. |

## Reproducing the demonstration

After TypeScript/MCP builds, build the native host with `cargo build --manifest-path packages/runtime-native/Cargo.toml`. On Windows:

```powershell
.\packages\runtime-native\target\debug\submind-runtime.exe capture artifacts\continuity-capture
node scripts/demonstrate-continuity.mjs artifacts/continuity-demo artifacts/continuity-capture/codex.json
# For two real captures, specify Copilot history and a project present in both:
node scripts/demonstrate-continuity.mjs artifacts/continuity-real-demo artifacts/continuity-capture/codex.json artifacts/continuity-capture/copilot.json oikoscape
```

Omit the capture argument to use a deterministic Codex fixture. Without the Copilot argument, the later Hermes feed is explicitly labelled as a fixture. With both captures, the script requires matching project identity, prior conversation evidence and a chronologically later Codex task. Each run should use a fresh output directory; the demo chooses a free loopback port and stops its own processes. It does not launch a coding agent.

## Remaining live-integration limitations

Claude/Gemini native history readers are not implemented. Compatible configured clients can use the general context API/MCP; live Claude, Gemini, Hermes and Copilot consumption has not been demonstrated here. The native cognition endpoint currently speaks the existing OpenAI-compatible HTTP message protocol; the TypeScript model-worker contract remains independently injectable.

Retained-memory generation remains deterministic evidence-backed work-trace summarization with heuristic confidence, not semantic belief extraction. Model ranking/composition was tested with fixtures and fallback, not a live inference endpoint. Consumption, usefulness and causal improvement remain unverified. Outcome records only correlate later events in a requested observed thread; project-only requests cannot claim thread outcomes. Historical statuses represent last observations, not live process health.

Desktop refreshes observations while its snapshot query runs; the headless API serves retained data and capture is explicit. Tauri was compiled, but interactive native GUI operation was not tested. These limits are surfaced rather than advertised as implemented capabilities.
