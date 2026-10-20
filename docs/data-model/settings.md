# Settings Data Model

Settings are product configuration records for SubMind behavior. They are
separate from `apps/desktop/src-tauri/tauri.conf.json`, which configures Tauri
windowing, build, and packaging behavior.

## Current Storage

The current settings config is stored in SQLite through the generic `app_state`
table:

| Field | Value |
| --- | --- |
| Table | `app_state` |
| Key | `settings_config` |
| Value | Versioned JSON object matching `SubMindSettingsConfig` |
| Current version | `1` |
| Source contract | `packages/shared-schemas/src/settings.ts` |

The JSON value is intentionally stored as one record because the desktop shell
loads and writes the config as a whole. Inside that payload, settings are split
by scope. If settings need independent queries, auditing, history, or partial
sync later, introduce first-class tables instead of overloading this blob.

## Scope Decision

SubMind uses three settings scopes.

| Setting | Scope | Reason |
| --- | --- | --- |
| `snapshotRefreshMs` | App/device | Local performance/runtime concern. It should not follow the operator profile or project identity. |
| `secretAutoHideMs` | Profile | Operator privacy preference. It should follow the profile across projects. |
| `projectStackDensity` | Profile | Operator UI preference. The renderer can still adapt layout responsively. |
| `guidanceAggression` | Profile default with project override | Operator default posture, with stricter or louder project-specific tuning when focused. |
| `actionRiskThreshold` | Profile default with project override | Operator default risk sensitivity, with project-specific overrides for higher-risk workspaces. |
| `checkpointMode` | Profile default with project override | Operator workstyle default, with project-specific overrides for risk, cost, or review needs. |

Selection does not apply project overrides. Focus does.

Resolution:

| Shell state | Effective settings |
| --- | --- |
| Global, no selection | App/device + profile defaults |
| Global, selected project | App/device + profile defaults; selected project overrides may be shown but are not applied |
| Focused project | App/device + profile defaults + focused project overrides |

## Version 1 Shape

```ts
interface AppSettingsConfig {
  version: 1;
  scope: "app";
  snapshotRefreshMs: number;
}

interface ProfileSettingsConfig {
  version: 1;
  scope: "profile";
  secretAutoHideMs: number;
  guidanceAggression: "restrained" | "balanced" | "assertive";
  actionRiskThreshold: "low" | "medium" | "high" | "critical";
  checkpointMode: "immediate" | "debounced" | "manual_review";
  projectStackDensity: "compact" | "balanced" | "expanded";
}

interface ProjectSettingsConfig {
  version: 1;
  scope: "project";
  projectId: string;
  guidanceAggression?: "restrained" | "balanced" | "assertive";
  actionRiskThreshold?: "low" | "medium" | "high" | "critical";
  checkpointMode?: "immediate" | "debounced" | "manual_review";
}

interface SubMindSettingsConfig {
  version: 1;
  app: AppSettingsConfig;
  profile: ProfileSettingsConfig;
  projectOverrides: Record<string, ProjectSettingsConfig>;
}
```

Defaults:

| Field | Default | Rule |
| --- | ---: | --- |
| `version` | `1` | Always normalized to current version |
| `app.snapshotRefreshMs` | `5000` | Clamped to `1000..60000` |
| `profile.secretAutoHideMs` | `30000` | Clamped to `5000..120000` |
| `profile.guidanceAggression` | `balanced` | Must be a known guidance mode |
| `profile.actionRiskThreshold` | `high` | Must be a known action risk level |
| `profile.checkpointMode` | `debounced` | Must be a known checkpoint mode |
| `profile.projectStackDensity` | `balanced` | Must be a known stack density |
| `projectOverrides.*` | `{}` | Only override-capable fields are stored |

## Effective Settings

Call `resolveEffectiveSettingsConfig(settings, focusedProjectId)` before using
settings for behavior. The resolver returns the applied values plus source
scopes for each editable setting.

Do not use selected project ID for effective behavior. Selected project override
counts may be displayed as context, but only focused project overrides apply.

## Ownership

- `packages/shared-schemas` owns the TypeScript contracts, defaults, enum
  values, storage key, scope markers, normalizer, updater, and effective
  resolver.
- `packages/store` owns repository reads and writes through `app_state`.
- `packages/ui-state` owns the shell draft, query helpers, derived Settings
  view model, and live behavior that depends on effective config values.
- `packages/ui-components` renders the Settings support surface.
- `apps/desktop` wires repository calls and passes the focused project ID when
  an override-capable setting is edited.

## Migration Rules

Every read path must call `normalizeSettingsConfig` before exposing settings to
the shell. Missing or malformed records return the current scoped defaults.

Legacy flat records without scoped `app` or `profile` objects are treated as
v1-compatible input and normalized into the current scoped v1 shape. Unknown
fields are ignored. Invalid enum values fall back to defaults. Numeric settings
are clamped to their accepted ranges.

When adding a v2 field or changing semantics:

1. Add the new contract and defaults in `packages/shared-schemas/src/settings.ts`.
2. Teach `normalizeSettingsConfig` to migrate known older versions explicitly.
3. Update `resolveEffectiveSettingsConfig` if the field can inherit or override.
4. Add tests for default config, malformed input, legacy flat payloads, and
   focused project override behavior when applicable.
5. Update this document before wiring UI controls.
