# SubMind Docs

This repository is scaffolded around the architecture in `AGENTS.md`.

Current phase alignment:

1. Schemas
2. Shell
3. Project Stack + Dashboard
4. Sessions
5. Memory
6. Guidance
7. Actions

The first pass establishes the workspace layout, locked schema constants, and thin package boundaries so implementation can proceed without pushing product logic into the desktop shell.

The current desktop shell is now on the new runtime stack:

- `apps/desktop` is a thin `Tauri + React + Tailwind` shell host.
- `packages/ui-state` owns the shell store and query helpers with `Zustand + TanStack Query`.
- `packages/store` now carries `Drizzle` SQLite schema definitions plus the preview repository/snapshot layer and the first real SQLite-backed repository path.
- `packages/workers` now projects checkpoint summaries that the Guidance screen can consume deterministically.
- `packages/workers` now also projects checkpoint summaries that the Actions screen can consume deterministically.
- The native runtime now merges Codex and Copilot activity around canonical workspace identity.
- Project search is available in the persistent project stack without changing selection or focus scope.
- A disabled-by-default local API exposes authenticated, read-only project search and exports with secret redaction.
- Protected values remain redacted in normal UI state and can be revealed temporarily by fingerprint from visible redaction markers.

Project and shell behavior is now aligned around the newer primary-screen model:

- The left rail is now a persistent project stack.
- Single click selects a project.
- Double click focuses or unfocuses the same project, while explicit focus actions remain available in the command strip.
- Primary screen switching now lives near the main content header for `Dashboard`, `Sessions`, `Memory`, `Guidance`, and `Actions`.
- `Project` no longer stores UI selection/focus state. That state now lives in `ui-state`.
- `Event` and `ActionItem` now use the richer direction expected by the updated `AGENTS.md`.
- Guidance is now checkpoint-driven: the shell surfaces intervention posture, linked memory, and adjacent action pressure instead of only flat guidance cards.
- Actions is now checkpoint-driven too: the shell surfaces queue posture, an action main view, and a deeper audit/context inspector instead of only an action list.

## Run Commands

Run commands from the repository root. Use `pnpm install` for dependencies, but
`npm run ...` is also fine for launching scripts after dependencies are present.
Do not use `npm install`; npm can omit optional native packages that Tauri and
Vite need.

If you switch between Windows Node and WSL/Linux Node, run `pnpm install` in the
runtime that will execute Node. Optional native packages are OS-specific.

Common commands:

- `pnpm run desktop:browser:dev` starts the React browser shell preview at `http://127.0.0.1:4173`.
- `pnpm run desktop:browser:build` builds the React browser shell into `apps/desktop/web-dist`.
- `pnpm run desktop:tauri:dev` launches the React shell in a native Tauri desktop window and can start the local authenticated API.
- `pnpm run context:mcp:build` builds the MCP bridge at `packages/protocol-mcp/dist/mcp-server.js` and prepares its standalone runtime under `packages/protocol-mcp/dist/node_modules`.
- `pnpm run shell:output` prints the preview bootstrap, UI state, runtime context, and store snapshot as JSON.
- `pnpm run typecheck` verifies the TypeScript workspace.
- `pnpm test` runs the schema, worker, store, state, and shell renderer tests.

Choose one startup mode. Do not mix commands from different modes; in
Windows/WSL mode, use the shell named by each step.

### Windows/WSL

Use this when SubMind runs as a Windows desktop app and Hermes or another MCP
client runs inside WSL.

Runtime ownership:

- Windows owns the desktop app, local API, token file, and MCP build output.
- WSL owns the MCP client registration and MCP stdio process.
- The WSL MCP process uses Windows `curl.exe` for HTTP calls to the Windows
  loopback API.
- The shared token file is `%USERPROFILE%\.config\submind\api-token` on Windows.
  Git Bash sees that same file as `$HOME/.config/submind/api-token`; WSL reads
  it through the mounted Windows profile path.

1. In Git Bash on Windows, build the MCP bridge and start SubMind:

```bash
npm run context:mcp:build
npm run desktop:tauri:dev
```

Keep this terminal running. `desktop:tauri:dev` creates or reads the shared
token at `$HOME/.config/submind/api-token`, exports it to the desktop process,
and starts the local API on `http://127.0.0.1:47821`.

2. In WSL from the same checkout, install or update the MCP wrapper:

```bash
bash scripts/install-wsl-mcp-wrapper.sh
```

The installer verifies the shared token, built MCP server, standalone MCP
runtime, WSL `node`, Windows `curl.exe`, and a direct MCP tools handshake.
It also writes wrapper diagnostics to
`$HOME/.local/state/submind/mcp-wrapper.log`.

You can rerun the same wrapper handshake before touching Hermes:

```bash
node scripts/smoke-mcp-wrapper.mjs "$HOME/.local/bin/submind-context-mcp"
```

3. In WSL, register and test the wrapper with Hermes:

```bash
hermes mcp list
hermes mcp add submind --command "$HOME/.local/bin/submind-context-mcp"
hermes mcp test submind
```

If `submind` is already registered, rerun `hermes mcp test submind` after the
wrapper install. If Hermes says it cannot connect during `mcp add`, rerun the
wrapper smoke test above and inspect the wrapper log:

```bash
tail -n 80 "$HOME/.local/state/submind/mcp-wrapper.log"
```

If the wrapper smoke test passes but Hermes still fails during `mcp add`, the
SubMind API and wrapper are reachable and the remaining issue is in Hermes
registration/configuration. Health checks must use `/v1/health` with the bearer
token; `/` is not a SubMind API route.

### WSL Only

Use this when SubMind, the local API, the MCP bridge, and the MCP client all run
inside WSL. Do not use Windows `node.exe` in this mode.

WSL native desktop mode requires WSLg plus the Tauri Linux system dependencies.
If those are not available, use the Windows/WSL mode instead for MCP access.

1. In WSL from the SubMind checkout, build the bridge and start SubMind:

```bash
pnpm run context:mcp:build
pnpm run desktop:tauri:dev
```

Keep this terminal running. `desktop:tauri:dev` creates or reads
`$HOME/.config/submind/api-token`, exports it to the desktop process, and starts
the local API on `http://127.0.0.1:47821`.

2. In another WSL shell from the SubMind checkout, verify the API and register
   the MCP wrapper:

```bash
bash scripts/install-local-mcp-wrapper.sh
node scripts/smoke-mcp-wrapper.mjs "$HOME/.local/bin/submind-context-mcp"
hermes mcp add submind --command "$HOME/.local/bin/submind-context-mcp"
hermes mcp test submind
```

### Linux Only

Use this when SubMind, the local API, the MCP bridge, and the MCP client all run
inside a native Linux environment.

1. In the Linux checkout, build the bridge and start SubMind:

```bash
pnpm run context:mcp:build
pnpm run desktop:tauri:dev
```

Keep this terminal running. `desktop:tauri:dev` creates or reads
`$HOME/.config/submind/api-token`, exports it to the desktop process, and starts
the local API on `http://127.0.0.1:47821`.

2. In another Linux shell from the same checkout, verify the API and register
   the MCP wrapper:

```bash
bash scripts/install-local-mcp-wrapper.sh
node scripts/smoke-mcp-wrapper.mjs "$HOME/.local/bin/submind-context-mcp"
hermes mcp add submind --command "$HOME/.local/bin/submind-context-mcp"
hermes mcp test submind
```

## Native Desktop Notes

- `apps/desktop` is now wired as a minimal Tauri app under `apps/desktop/src-tauri`.
- The native dev path uses the same React browser shell as its frontend via Tauri's `beforeDevCommand`.
- Native desktop mode now boots a local SQLite-backed repository through the Tauri SQL plugin and seeds it from the preview snapshot on first run.
- Browser preview still uses the transient preview repository so shell iteration does not depend on the native runtime.
- This repository does not set up installers or packaging workflows yet.
- Native Tauri dev requires a Rust toolchain for the active OS because Tauri compiles a host binary.
- The workspace Tauri dev script prepends the standard Cargo path (`$HOME/.cargo/bin`) before launch on every platform to reduce shell-specific PATH issues.
