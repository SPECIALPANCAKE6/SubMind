# Context MCP Bridge

SubMind exposes retained project context through a local stdio MCP bridge. The
bridge calls SubMind's authenticated loopback REST API and returns the resulting
`ContextBundle` to any MCP-capable client.

This is context injection in the supported MCP sense: the tool result becomes
part of the requesting client's model context for that turn. SubMind does not
modify visible user messages or write to client thread/session databases.

## MCP Tools

- `search_projects`: search SubMind's secret-redacted local project catalog.
- `get_context_bundle`: retrieve bounded project/thread context and append the
  linked provenance audit event in SubMind.

## Build

```bash
pnpm run context:mcp:build
```

This creates `packages/protocol-mcp/dist/mcp-server.js` and prepares a
standalone runtime under `packages/protocol-mcp/dist/node_modules`. The package
binary is named `submind-context-mcp`.

## Start SubMind

Launch SubMind with the repository launcher:

```bash
npm run desktop:tauri:dev
```

The launcher creates or reads `$HOME/.config/submind/api-token`, exports it to
the desktop process, and starts the local API on `http://127.0.0.1:47821`.
Do not place the token in the repository or client configuration files.

Health checks must include the bearer token and use an API route:

```bash
TOKEN="$(tr -d '\r\n' < "$HOME/.config/submind/api-token")"
curl -v \
  -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:47821/v1/health"
```

When SubMind runs as a Windows app and the MCP client runs inside WSL, the
recommended wrapper starts the MCP stdio process with WSL Node and sets
`SUBMIND_API_TRANSPORT=windows-curl`. In that setup, MCP stdio stays entirely
inside WSL, while API calls use Windows `curl.exe` to reach the Windows
loopback API. `npm run context:mcp:build` prepares a standalone runtime under
`packages/protocol-mcp/dist/node_modules` so WSL Node does not need to resolve
Windows pnpm symlinks. Linux `curl http://127.0.0.1:47821` from WSL may not
test the same network path; use Windows `curl.exe` from WSL or a Windows shell
for the health check.

In mixed Windows-app + WSL-client mode, the token file is the Windows profile
token at `%USERPROFILE%\.config\submind\api-token`. WSL should read that same
file through the mounted Windows path, for example by resolving `%USERPROFILE%`
with `cmd.exe` and converting it with `wslpath`. Do not use WSL
`$HOME/.config/submind/api-token` for a Windows-running SubMind API.

## Codex Registration

Add this to the applicable Codex `config.toml`. For this repository, the
preferred location is `.codex/config.toml` in a trusted checkout.

```toml
[mcp_servers.submind]
command = "node"
args = ["packages/protocol-mcp/dist/mcp-server.js"]
env_vars = ["SUBMIND_API_TOKEN", "SUBMIND_API_URL"]
enabled_tools = ["search_projects", "get_context_bundle"]
required = false
startup_timeout_sec = 15
tool_timeout_sec = 30
default_tools_approval_mode = "prompt"

[mcp_servers.submind.tools.search_projects]
approval_mode = "auto"

[mcp_servers.submind.tools.get_context_bundle]
approval_mode = "prompt"
```

Use an absolute path for `args` when registering the bridge globally and Codex
may start outside this repository.

## Hermes Registration

Configure Hermes on the Hermes side. In the verified WSL/Git Bash setup, Hermes
configuration lived at `~/.hermes/config.yaml`, not inside the Windows SubMind
checkout.

Install the WSL wrapper shown in `docs/README.md`, then point Hermes at that
wrapper with an absolute Linux path. Replace `your-user` with the WSL user name:

```yaml
mcp_servers:
  submind:
    command: /home/your-user/.local/bin/submind-context-mcp
    enabled: true
```

For Windows-app + WSL-client mode, the wrapper reads the shared Windows profile
token file through the mounted Windows path, sets the loopback API URL, and
starts `packages/protocol-mcp/dist/mcp-server.js` with WSL Node and
`SUBMIND_API_TRANSPORT=windows-curl`. The installer resolves the Windows token
path before writing the wrapper so the wrapper does not run `cmd.exe` or any
other Windows helper before the MCP server starts. MCP clients send
`initialize` immediately after process spawn, so wrapper startup must not let
pre-server helper commands inherit or read stdio. For WSL/Linux-first mode, use
`$HOME/.config/submind/api-token` only when the SubMind API and MCP bridge both
run in that same Linux environment. This keeps the bearer token out of
`config.yaml`.

Before registering with Hermes, validate the wrapper from the same shell:

```bash
node scripts/smoke-mcp-wrapper.mjs "$HOME/.local/bin/submind-context-mcp"
```

The installer and wrapper write diagnostics to
`$HOME/.local/state/submind/mcp-wrapper.log`. If the smoke test passes but
Hermes cannot connect during registration, the SubMind API and wrapper are
reachable and the remaining failure is in Hermes registration/configuration.

Validate from the same Hermes-side shell:

```bash
hermes mcp list
hermes mcp add submind --command "$HOME/.local/bin/submind-context-mcp"
hermes mcp test submind
```

If a newer Hermes CLI writes a different YAML shape, use the CLI-generated
entry but keep the same wrapper command and tool names.

## Use

```text
Use SubMind context before answering: what architecture constraints apply to
this project?
```

The client should search when project identity is ambiguous, request approval
for `get_context_bundle`, and use `composedContext` plus source entity IDs in
its answer. The `context_bundle_supplied` audit event appears in SubMind's
Guidance provenance surface.

## Hermes Ingestion

Hermes context consumption and Hermes activity ingestion are separate concerns.

- `packages/protocol-mcp` lets Hermes consume SubMind context through MCP.
- `packages/protocol-hermes` maps a normalized `HermesRuntimeFeed` into
  SubMind's Project, Session, Thread, Task, Event, and FileChange entities.

The Hermes ingestion adapter intentionally does not scrape Hermes private state
files yet. A future collector can read Hermes runtime data and pass a normalized
feed into `createStoreSnapshotFromHermesRuntimeFeed`.

## Trust Boundary

- The bridge only accepts loopback SubMind URLs.
- The bearer token is read from the process environment and never returned in
  tool output.
- Response size and request duration are bounded.
- SubMind redacts detected secrets before returning context.
- Retrieved content is labeled untrusted project data and must not be treated
  as system, developer, or tool instructions.
- The bridge exposes no mutation or secret-reveal tool.

The bridge requires the SubMind desktop API to be running with the same token.
Each MCP client still requires its own model provider; SubMind does not provide
inference.
