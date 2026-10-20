# Checkpoint Model Worker Runtime

`@submind/workers` exposes `executeCheckpointModelWorkers` to execute the
model-worker sequence already defined by `createWorkerPlan`.

The runtime receives a store snapshot, checkpoint kind, scope, and a
host-provided `ModelWorkerAdapter`. It resolves and validates the project scope,
prepares a redacted context containing only project-related entities (plus
global memory), and invokes the planned model workers sequentially. Each
successful structured output is included in `priorResults` for subsequent
workers in the same checkpoint. Context collections are bounded to the 60 most
recently updated records of each kind.

## Native desktop adapter

The desktop shell exports `executeDesktopCheckpointModelWorkers`. It obtains a
fresh repository snapshot, runs the checkpoint runtime, and uses the native
Tauri `execute_model_worker` command for provider calls. The command reads
`SUBMIND_CONTEXT_MODEL_URL`, `SUBMIND_CONTEXT_MODEL`, and the optional
`SUBMIND_CONTEXT_MODEL_TOKEN` in the native process. This reuses the
OpenAI-compatible model configuration and safety boundary used by
`POST /v1/context-bundle`; the model token is never sent to the webview.

The native command accepts only worker/checkpoint combinations already present
in `createWorkerPlan`, redacts inputs and outputs, limits serialized input and
response size, disables redirects, and enforces a request timeout. It returns
an explicit error when no context model is configured or the provider response
does not contain a JSON `output` object.

```ts
const run = await executeDesktopCheckpointModelWorkers("thread", { threadId });
```

## Checkpoint triggers

Desktop observation refresh establishes a baseline on its first successful
snapshot and does not replay historical work. Later snapshots are diffed by
event ID: new agent/Codex/subagent lifecycle, work-change, memory, guidance,
and action events schedule one event checkpoint per scope and a thread
checkpoint when the event belongs to a thread. A session checkpoint is
scheduled when an active session transitions to idle or completed. New
memory, guidance, or action evidence also schedules a guidance checkpoint;
new action evidence schedules an action checkpoint.

Triggers are coalesced for five seconds, with a 30-second maximum wait during
continuous activity. Explicit callers can use `triggerDesktopCheckpoint` for
the same debounced queue, or `runDesktopCheckpointNow` to run immediately.
Model output does not implicitly schedule another checkpoint. The queue is in
memory and is not restored after an application restart.

The run result reports `completed`, `partial`, or `failed` and includes one
result per planned worker. A failed worker is reported explicitly; later
workers still run and receive outputs from successful earlier workers only.
Provider error messages and returned outputs are redacted before they leave the
runtime. The desktop runner persists the run as one idempotent
`model-checkpoint-run` cognitive marker event in project history.

## Checkpoint pipeline

`createCheckpointPipeline` (`@submind/core`) is the single composition point:
observed snapshots go to the trigger coordinator, which debounces and serially
schedules the executor; each run is validated into proposals, persisted, and
then handed to an optional delivery sink. The desktop builds it with a lazy
repository resolver and the native model adapter.

Persistence order: generated proposals first, then the
`model-checkpoint-run` audit event. If proposal persistence fails, the audit
event is still written (with `persistenceError`) and the run rejects, so the
worker results are never silently lost.

Delivery receives only persisted content. `createActiveSessionGeneratedDelivery`
re-reads each Task/Guidance proposal and pushes it through the active-session
adapter only if it already passes operator-approval validation; fresh model
proposals (`proposed` Tasks, `candidate` Guidance) are reported as `skipped`
until reviewed. Memory is never pushed. A delivery failure is reported in the
result and never undoes the persisted run. The desktop registers no delivery
sink because no harness adapter exists yet.

## Hermes active-session delivery

`createHermesSessionDeliveryAdapter({ apiKey, baseUrl? })` implements
`ActiveSessionDeliveryAdapter` for sessions SubMind observed from Hermes
(`session-hermes-<id>` / `thread-hermes-<id>`). It posts the operator-approved
message to the Hermes API server's `POST /api/sessions/{id}/chat` with the
`API_SERVER_KEY` bearer token (default `http://127.0.0.1:8642`). Verified
against the local Hermes source:

- The message is a **user turn**: Hermes runs the agent and answers
  synchronously, so delivery is not passive context injection. The call blocks
  until the turn ends (default timeout 120 s; a timeout reports an unknown
  outcome and is audited as failed).
- Unknown sessions return 404 and nothing is created. (`/v1/chat/completions`
  with `X-Hermes-Session-Id` would silently create a session, so it is not used.)
- The endpoint returns no delivery or run ID, so the receipt ID is generated
  locally (`hermes-session-chat-<uuid>`). A 200 confirms Hermes accepted and
  answered the turn, not that the agent's turn succeeded.
- Plain `http` is allowed only for loopback hosts; the key is never embedded in
  URLs, persisted, or logged by the adapter.
- The desktop registers a native-backed variant
  (`createNativeHermesSessionDeliveryAdapter`) that calls the
  `deliver_hermes_session_message` Tauri command. The HTTP call, key, and URL
  checks live in `packages/runtime-native/src/hermes_delivery.rs`, so the key
  never reaches the webview or SQLite. Configure it in Settings → "Hermes API
  server" (base URL, allow-remote, write-only API key). Saved values live in
  `hermes-delivery.json` in the native app data directory (key included, file
  mode 0600 on unix); the key is never returned to the UI. Environment
  variables override saved values per field: `SUBMIND_HERMES_API_KEY`,
  `SUBMIND_HERMES_API_URL` (default `http://127.0.0.1:8642`), and
  `SUBMIND_HERMES_ALLOW_REMOTE=true` for non-loopback servers (which must use
  HTTPS). The "Push to active session"
  buttons on tasks and guidance call it; availability comes from
  `get_hermes_delivery_status`, and the unavailable reason is shown when unset.
  This path has not been exercised against a live Hermes server.

## Memory and guidance proposals

Thread and session extraction workers may return `output.memories`, an array of
objects containing a valid memory bucket, summary, content, confidence, and
source event/file IDs. The proposal builder accepts only source IDs belonging
to the same project and checkpoint scope, then persists accepted items as
`MemoryItem` drafts with derived curation state. These drafts remain excluded
from context retrieval until curated.

The `task_synthesis` worker runs at thread and session checkpoints. It returns
distinct work items with a thread ID, title, summary, semantic status
(`queued`, `active`, `blocked`, or `completed`), priority, and source event
IDs. Each proposal must cite evidence from its own thread and is persisted as a
model-sourced `Task` in the proposed state, with the semantic status retained
as `suggestedStatus`. Accepting the proposal applies that reviewed status; a
thread may yield zero or many tasks, and thread existence alone is not evidence
of a task.

Guidance composition workers at the guidance checkpoint may return
`output.guidance`, an array containing title, summary, rationale, confidence,
evidence and policy summaries, plus linked event/memory/action IDs. Accepted
items must cite an event in the project/scope and become model-sourced
`GuidanceItem` candidates. They are not injected automatically.

Invalid proposal entries are skipped and their rejection reasons are recorded
in the checkpoint audit event. Generated records are inserted idempotently;
existing records are not overwritten, so a later run cannot replace operator
curation. The store validates project/session/thread scope and entity links
before persistence. Desktop generation controls run the selected checkpoint
immediately. Operators can accept or dismiss memory drafts, approve guidance
as a suggestion or suppress it, and accept or reject proposed tasks. Review
changes are persisted with event-history records. Acceptance does not inject
guidance into agent context or perform any external action.

### Future context-bundle eligibility

Memory, Guidance, and Task records have a separate persisted
`contextEligible` control. New model-generated proposals are always created
ineligible. Reviewing a Task or approving Guidance does not enable it
implicitly; the operator must explicitly choose **Eligible for future context
bundles**. Draft, archived, superseded, candidate, suppressed, resolved,
proposed, rejected, and completed records cannot be newly enabled for context.
Existing databases retain eligibility for previously active/stale memory and
previously suggested/injected Guidance during migration; model candidates are
not migrated as eligible. Legacy snapshots without the field retain the old
eligible behavior only for active memory and approved Guidance.

The context-bundle candidate policy is shared between the TypeScript worker
and native `/v1/context-bundle` implementation. Eligible Tasks in queued,
active, or blocked state can be returned as `task` context data with their
source-event provenance. Task acceptance and bundle eligibility remain
independent actions.

### Review history and active-session delivery

Memory curation, Task review, and Guidance review events carry the previous
and next proposal state. The operator can revert the latest matching change;
the repository checks that the current proposal still matches the event's
next state before writing the restoration and a separate
`proposal-review-reverted` event. A later edit or eligibility change blocks a
stale revert rather than overwriting it.

Future-bundle eligibility and **Push to active session** are deliberately
separate. A context-eligible proposal may appear in a later request-driven
bundle; that is not a push, and context API/MCP consumption remains unverified.
An explicit active-session push uses the platform-neutral
`ActiveSessionDeliveryAdapter` contract in `@submind/core`, validates the
selected open thread and matching proposal scope, sends an operator-approved
Task or Guidance message, and audits requested/delivered/failed outcomes.
Successful delivery cannot be undone by proposal review history.

The desktop currently registers no active-session delivery adapter, so its
push controls remain visibly unavailable and do not report success. The
adapter contract is ready for a harness-specific implementation; the
`/v1/context-bundle` API and MCP are response/request transports and are not
used as a fake push channel.

The runtime does not select or configure a provider. Provider settings remain
in the host/native process, and checkpoint timing is owned by the desktop
trigger coordinator.
