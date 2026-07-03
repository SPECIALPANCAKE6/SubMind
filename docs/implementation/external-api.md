# SubMind Local External API

SubMind can expose a local read-only API for trusted tools that need to look up
project context captured or created by SubMind.

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
- Serves read-only project data only.
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
```

The export response includes the matched project plus its scoped sessions,
threads, tasks, events, file changes, memory, guidance, and actions. Global
memory is not included in project exports in v1.

Redacted values are returned as stable markers such as
`[redacted:submind-token:<fingerprint>]`. The marker is useful for recognizing
that the same hidden value appeared more than once without exposing the value
itself.
