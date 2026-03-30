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
- `packages/store` now carries `Drizzle` SQLite schema definitions plus the preview repository/snapshot layer.
- `packages/workers` now projects checkpoint summaries that the Guidance screen can consume deterministically.
- `packages/workers` now also projects checkpoint summaries that the Actions screen can consume deterministically.

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

- `npm run shell:output` prints the current preview bootstrap, initial UI state, runtime context, and store snapshot as JSON.
- `npm run desktop:browser:dev` starts the React browser shell preview at `http://127.0.0.1:4173`.
- `npm run desktop:browser:build` builds the React browser shell into `apps/desktop/web-dist`.
- `npm run desktop:tauri:dev` launches the same React shell in a native Tauri desktop window.
- `npm run desktop:dev` remains an alias for `npm run desktop:browser:dev`.
- `npm run desktop:build` remains an alias for `npm run desktop:browser:build`.
- `npm run typecheck` verifies the TypeScript workspace.
- `npm test` runs the schema, worker, store, state, and shell renderer tests.

## Native Desktop Notes

- `apps/desktop` is now wired as a minimal Tauri app under `apps/desktop/src-tauri`.
- The native dev path uses the same React browser shell as its frontend via Tauri's `beforeDevCommand`.
- This repository does not set up installers or packaging workflows yet.
- Native Tauri dev requires a local Rust toolchain on Windows because Tauri compiles a Rust host binary.
- The workspace Tauri dev script now prepends the standard Windows Cargo path (`%USERPROFILE%\\.cargo\\bin`) before launch to reduce shell-specific PATH issues.
