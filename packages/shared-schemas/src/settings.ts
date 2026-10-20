import type { ActionItem } from "./entities.js";

export const guidanceAggressionModes = [
  "restrained",
  "balanced",
  "assertive"
] as const;

export const checkpointModes = [
  "immediate",
  "debounced",
  "manual_review"
] as const;

export const projectStackDensities = [
  "compact",
  "balanced",
  "expanded"
] as const;

export const currentSettingsConfigVersion = 1 as const;
export const settingsConfigStorageKey = "settings_config" as const;
export const settingsScopes = ["app", "profile", "project"] as const;
export const projectOverrideSettingKeys = [
  "guidanceAggression",
  "actionRiskThreshold",
  "checkpointMode"
] as const;
export const settingsConfigEditableKeys = [
  "snapshotRefreshMs",
  "secretAutoHideMs",
  "guidanceAggression",
  "actionRiskThreshold",
  "checkpointMode",
  "projectStackDensity"
] as const;

export type SettingsConfigVersion = typeof currentSettingsConfigVersion;
export type GuidanceAggressionMode = (typeof guidanceAggressionModes)[number];
export type CheckpointMode = (typeof checkpointModes)[number];
export type ProjectStackDensity = (typeof projectStackDensities)[number];
export type SettingsConfigScope = (typeof settingsScopes)[number];
export type ProjectOverrideSettingKey = (typeof projectOverrideSettingKeys)[number];
export type SettingsConfigKey = (typeof settingsConfigEditableKeys)[number];

export interface SettingsConfigValueMap {
  snapshotRefreshMs: number;
  secretAutoHideMs: number;
  guidanceAggression: GuidanceAggressionMode;
  actionRiskThreshold: ActionItem["riskLevel"];
  checkpointMode: CheckpointMode;
  projectStackDensity: ProjectStackDensity;
}

export type SettingsConfigValue = SettingsConfigValueMap[SettingsConfigKey];

export interface AppSettingsConfig {
  version: SettingsConfigVersion;
  scope: "app";
  snapshotRefreshMs: number;
}

export interface ProfileSettingsConfig {
  version: SettingsConfigVersion;
  scope: "profile";
  secretAutoHideMs: number;
  guidanceAggression: GuidanceAggressionMode;
  actionRiskThreshold: ActionItem["riskLevel"];
  checkpointMode: CheckpointMode;
  projectStackDensity: ProjectStackDensity;
}

export interface ProjectSettingsConfig {
  version: SettingsConfigVersion;
  scope: "project";
  projectId: string;
  guidanceAggression?: GuidanceAggressionMode;
  actionRiskThreshold?: ActionItem["riskLevel"];
  checkpointMode?: CheckpointMode;
}

export interface SubMindSettingsConfig {
  version: SettingsConfigVersion;
  app: AppSettingsConfig;
  profile: ProfileSettingsConfig;
  projectOverrides: Record<string, ProjectSettingsConfig>;
}

export interface EffectiveSettingsConfig {
  version: SettingsConfigVersion;
  projectId: string | null;
  snapshotRefreshMs: number;
  secretAutoHideMs: number;
  guidanceAggression: GuidanceAggressionMode;
  actionRiskThreshold: ActionItem["riskLevel"];
  checkpointMode: CheckpointMode;
  projectStackDensity: ProjectStackDensity;
  sourceScopes: Record<SettingsConfigKey, SettingsConfigScope>;
}

export type SettingsConfigDraft = SubMindSettingsConfig;

export const defaultAppSettingsConfig: AppSettingsConfig = {
  version: currentSettingsConfigVersion,
  scope: "app",
  snapshotRefreshMs: 5_000
};

export const defaultProfileSettingsConfig: ProfileSettingsConfig = {
  version: currentSettingsConfigVersion,
  scope: "profile",
  secretAutoHideMs: 30_000,
  guidanceAggression: "balanced",
  actionRiskThreshold: "high",
  checkpointMode: "debounced",
  projectStackDensity: "balanced"
};

export const defaultSettingsConfigDraft: SettingsConfigDraft = {
  version: currentSettingsConfigVersion,
  app: defaultAppSettingsConfig,
  profile: defaultProfileSettingsConfig,
  projectOverrides: {}
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickEnumValue<T extends readonly string[]>(
  value: unknown,
  values: T,
  fallback: T[number]
): T[number] {
  return typeof value === "string" && values.includes(value)
    ? value
    : fallback;
}

function pickOptionalEnumValue<T extends readonly string[]>(
  value: unknown,
  values: T
): T[number] | undefined {
  return typeof value === "string" && values.includes(value)
    ? value
    : undefined;
}

function normalizeAppSettingsConfig(
  input: Record<string, unknown>
): AppSettingsConfig {
  const snapshotRefreshMs = Number(input.snapshotRefreshMs);

  return {
    version: currentSettingsConfigVersion,
    scope: "app",
    snapshotRefreshMs: clampNumber(
      Number.isFinite(snapshotRefreshMs)
        ? snapshotRefreshMs
        : defaultAppSettingsConfig.snapshotRefreshMs,
      1_000,
      60_000
    )
  };
}

function normalizeProfileSettingsConfig(
  input: Record<string, unknown>
): ProfileSettingsConfig {
  const secretAutoHideMs = Number(input.secretAutoHideMs);

  return {
    version: currentSettingsConfigVersion,
    scope: "profile",
    secretAutoHideMs: clampNumber(
      Number.isFinite(secretAutoHideMs)
        ? secretAutoHideMs
        : defaultProfileSettingsConfig.secretAutoHideMs,
      5_000,
      120_000
    ),
    guidanceAggression: pickEnumValue(
      input.guidanceAggression,
      guidanceAggressionModes,
      defaultProfileSettingsConfig.guidanceAggression
    ),
    actionRiskThreshold: pickEnumValue(
      input.actionRiskThreshold,
      ["low", "medium", "high", "critical"] as const,
      defaultProfileSettingsConfig.actionRiskThreshold
    ),
    checkpointMode: pickEnumValue(
      input.checkpointMode,
      checkpointModes,
      defaultProfileSettingsConfig.checkpointMode
    ),
    projectStackDensity: pickEnumValue(
      input.projectStackDensity,
      projectStackDensities,
      defaultProfileSettingsConfig.projectStackDensity
    )
  };
}

function hasProjectOverrideValues(config: ProjectSettingsConfig): boolean {
  return (
    config.guidanceAggression !== undefined ||
    config.actionRiskThreshold !== undefined ||
    config.checkpointMode !== undefined
  );
}

function normalizeProjectSettingsConfig(
  projectId: string,
  input: unknown
): ProjectSettingsConfig | null {
  const source = isRecord(input) ? input : {};
  const resolvedProjectId =
    typeof source.projectId === "string" && source.projectId.trim()
      ? source.projectId.trim()
      : projectId.trim();

  if (!resolvedProjectId) {
    return null;
  }

  const config: ProjectSettingsConfig = {
    version: currentSettingsConfigVersion,
    scope: "project",
    projectId: resolvedProjectId
  };
  const guidanceAggression = pickOptionalEnumValue(
    source.guidanceAggression,
    guidanceAggressionModes
  );
  const actionRiskThreshold = pickOptionalEnumValue(
    source.actionRiskThreshold,
    ["low", "medium", "high", "critical"] as const
  );
  const checkpointMode = pickOptionalEnumValue(
    source.checkpointMode,
    checkpointModes
  );

  if (guidanceAggression !== undefined) {
    config.guidanceAggression = guidanceAggression;
  }

  if (actionRiskThreshold !== undefined) {
    config.actionRiskThreshold = actionRiskThreshold;
  }

  if (checkpointMode !== undefined) {
    config.checkpointMode = checkpointMode;
  }

  return hasProjectOverrideValues(config) ? config : null;
}

function normalizeProjectOverrides(
  input: unknown
): Record<string, ProjectSettingsConfig> {
  if (!isRecord(input)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input).flatMap(([projectId, value]) => {
      const config = normalizeProjectSettingsConfig(projectId, value);
      return config ? [[config.projectId, config]] : [];
    })
  );
}

export function normalizeSettingsConfig(
  input: Partial<SettingsConfigDraft> | Record<string, unknown> | null | undefined
): SettingsConfigDraft {
  const source = isRecord(input) ? input : {};
  const hasScopedShape =
    "app" in source || "profile" in source || "projectOverrides" in source;
  const appSource = hasScopedShape && isRecord(source.app) ? source.app : source;
  const profileSource =
    hasScopedShape && isRecord(source.profile) ? source.profile : source;

  return {
    version: currentSettingsConfigVersion,
    app: normalizeAppSettingsConfig(appSource),
    profile: normalizeProfileSettingsConfig(profileSource),
    projectOverrides: normalizeProjectOverrides(source.projectOverrides)
  };
}

export function resolveEffectiveSettingsConfig(
  input: Partial<SettingsConfigDraft> | Record<string, unknown> | null | undefined,
  projectId: string | null = null
): EffectiveSettingsConfig {
  const settingsConfig = normalizeSettingsConfig(input);
  const projectOverride =
    projectId === null ? undefined : settingsConfig.projectOverrides[projectId];
  const hasGuidanceOverride = projectOverride?.guidanceAggression !== undefined;
  const hasRiskOverride = projectOverride?.actionRiskThreshold !== undefined;
  const hasCheckpointOverride = projectOverride?.checkpointMode !== undefined;

  return {
    version: currentSettingsConfigVersion,
    projectId,
    snapshotRefreshMs: settingsConfig.app.snapshotRefreshMs,
    secretAutoHideMs: settingsConfig.profile.secretAutoHideMs,
    guidanceAggression:
      projectOverride?.guidanceAggression ??
      settingsConfig.profile.guidanceAggression,
    actionRiskThreshold:
      projectOverride?.actionRiskThreshold ??
      settingsConfig.profile.actionRiskThreshold,
    checkpointMode:
      projectOverride?.checkpointMode ?? settingsConfig.profile.checkpointMode,
    projectStackDensity: settingsConfig.profile.projectStackDensity,
    sourceScopes: {
      snapshotRefreshMs: "app",
      secretAutoHideMs: "profile",
      guidanceAggression: hasGuidanceOverride ? "project" : "profile",
      actionRiskThreshold: hasRiskOverride ? "project" : "profile",
      checkpointMode: hasCheckpointOverride ? "project" : "profile",
      projectStackDensity: "profile"
    }
  };
}

export function updateSettingsConfigValue(
  input: Partial<SettingsConfigDraft> | Record<string, unknown> | null | undefined,
  key: SettingsConfigKey,
  value: SettingsConfigValue,
  options: { projectId?: string | null } = {}
): SettingsConfigDraft {
  const settingsConfig = normalizeSettingsConfig(input);
  const projectId = options.projectId?.trim() || null;

  if (key === "snapshotRefreshMs") {
    return normalizeSettingsConfig({
      ...settingsConfig,
      app: {
        ...settingsConfig.app,
        snapshotRefreshMs: value
      }
    });
  }

  if (key === "secretAutoHideMs" || key === "projectStackDensity") {
    return normalizeSettingsConfig({
      ...settingsConfig,
      profile: {
        ...settingsConfig.profile,
        [key]: value
      }
    });
  }

  if (!projectId) {
    return normalizeSettingsConfig({
      ...settingsConfig,
      profile: {
        ...settingsConfig.profile,
        [key]: value
      }
    });
  }

  return normalizeSettingsConfig({
    ...settingsConfig,
    projectOverrides: {
      ...settingsConfig.projectOverrides,
      [projectId]: {
        ...settingsConfig.projectOverrides[projectId],
        version: currentSettingsConfigVersion,
        scope: "project",
        projectId,
        [key]: value
      }
    }
  });
}

export function resetSettingsConfigDraft(): SettingsConfigDraft {
  return normalizeSettingsConfig(defaultSettingsConfigDraft);
}

export function getSettingsControlScope(
  key: SettingsConfigKey,
  projectId: string | null = null
): SettingsConfigScope {
  if (key === "snapshotRefreshMs") {
    return "app";
  }

  if (key === "secretAutoHideMs" || key === "projectStackDensity") {
    return "profile";
  }

  return projectId ? "project" : "profile";
}

export function formatSettingsScopeLabel(scope: SettingsConfigScope): string {
  if (scope === "app") {
    return "App/device";
  }

  if (scope === "project") {
    return "Project override";
  }

  return "Profile";
}

export function formatSettingsSourceLabel(scope: SettingsConfigScope): string {
  if (scope === "app") {
    return "App setting";
  }

  if (scope === "project") {
    return "Project override";
  }

  return "Profile default";
}

export function getProjectSettingsOverrideCount(
  input: Partial<SettingsConfigDraft> | Record<string, unknown> | null | undefined,
  projectId: string | null = null
): number {
  if (!projectId) {
    return 0;
  }

  const settingsConfig = normalizeSettingsConfig(input);
  const projectOverride = settingsConfig.projectOverrides[projectId];

  if (!projectOverride) {
    return 0;
  }

  return projectOverrideSettingKeys.filter(
    (key) => projectOverride[key] !== undefined
  ).length;
}

export function getSettingsScopeForKey(
  key: SettingsConfigKey
): SettingsConfigScope | "profile_project" {
  if (key === "snapshotRefreshMs") {
    return "app";
  }

  if (key === "secretAutoHideMs" || key === "projectStackDensity") {
    return "profile";
  }

  return "profile_project";
}

export function getProfileDefaultSettingsKeys(): SettingsConfigKey[] {
  return [
    "secretAutoHideMs",
    "guidanceAggression",
    "actionRiskThreshold",
    "checkpointMode",
    "projectStackDensity"
  ];
}

export function getProjectOverrideSettingsKeys(): ProjectOverrideSettingKey[] {
  return [...projectOverrideSettingKeys];
}

export function getAppSettingsKeys(): SettingsConfigKey[] {
  return ["snapshotRefreshMs"];
}
