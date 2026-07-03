# SubMind Local External API

SubMind can expose a local retrieval API for trusted tools that need project
context captured or created by SubMind. Retrieval cannot mutate project data,
but every successful context-bundle request appends an audit event recording
exactly what SubMind supplied.

The server is disabled by default. It starts only when the desktop app is run
with a bearer token:

```powershell
$env:SUBMIND_API_TOKEN = "replace-with-at-least-32-random-characters"
$env:SUBMIND_API_PORT = "47821"
pnpm run desktop:tauri:dev
```

Security posture:

- Binds to `127.0.0.1` only.
- Requires `Authorization: Bearer <SUBMIND_API_TOKEN>` for every endpoint.
- Serves read-only project data and writes append-only context supply audit events.
- Does not expose mutation endpoints.
- Redacts detected secrets, credential assignments, auth headers, email
  addresses, and local Windows user path segments before JSON leaves the API.
- Does not provide any API method to reveal hidden secrets.
- Adds `Cache-Control: no-store` to responses.

Endpoints:

```http
GET /v1/health
GET /v1/projects?query=submind&limit=10
GET /v1/project-export?query=SubMind
GET /v1/project-export?projectId=project-submind
GET /v1/projects/project-submind/export
POST /v1/context-bundle
```

The export response includes the matched project plus its scoped sessions,
threads, tasks, events, file changes, memory, guidance, and actions. Global
memory is not included in project exports in v1.

Redacted values are returned as stable markers such as
`[redacted:submind-token:<fingerprint>]`. The marker is useful for recognizing
that the same hidden value appeared more than once without exposing the value
itself.

## Context bundles

`POST /v1/context-bundle` accepts a project identity, the requesting prompt,
optional thread scope, and bounded item/token limits:

```powershell
$body = @{
  projectId = "project-submind"
  threadId = "thread-submind-migration"
  prompt = "What should Codex know before changing SubMind guidance?"
  maxItems = 8
  maxTokens = 1200
  kinds = @("project_context", "memory", "guidance", "recent_change", "pending_action")
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:47821/v1/context-bundle" `
  -Headers @{ Authorization = "Bearer $env:SUBMIND_API_TOKEN" } `
  -ContentType "application/json" `
  -Body $body
```

Use either `projectId` or `projectQuery`. `prompt` is required and is capped at
8,000 characters. `maxItems` is clamped to 1-20 and `maxTokens` to 100-4,000.
The response contains selected `ContextDatum` records, source entity IDs, the
composed context, ranking mode, and the linked audit event ID. The raw prompt is
not retained; the bundle and audit contain only a fingerprint of its redacted
form and a non-content summary with project name and character count.

Deterministic filtering always runs first. It excludes archived, superseded,
and speculative memory; suppressed/resolved guidance; and completed actions.
It then scores candidates using project scope, thread scope, state, confidence,
freshness, and prompt terms.

## Optional model ranking

Without model configuration, context bundles use the deterministic ranking and
say so in `ranking.mode`. To rank and compose with an OpenAI-compatible chat
completion endpoint, configure the desktop process:

```powershell
$env:SUBMIND_CONTEXT_MODEL_URL = "http://127.0.0.1:11434/v1/chat/completions"
$env:SUBMIND_CONTEXT_MODEL = "local-context-model"
# Optional when the provider requires authentication:
$env:SUBMIND_CONTEXT_MODEL_TOKEN = "provider-token"
```

Non-loopback model URLs are rejected unless the operator also sets:

```powershell
$env:SUBMIND_CONTEXT_MODEL_ALLOW_REMOTE = "true"
```

Only the already-redacted prompt, project identity, and candidate data are sent
to the model. Provider tokens stay in the native process and are never included
in responses, logs, or audit events. Invalid model output, unknown candidate
IDs, provider failures, and timeouts fall back to deterministic ranking; the
response does not claim that model ranking ran.
