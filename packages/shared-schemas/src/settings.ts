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

export type GuidanceAggressionMode = (typeof guidanceAggressionModes)[number];
export type CheckpointMode = (typeof checkpointModes)[number];
export type ProjectStackDensity = (typeof projectStackDensities)[number];

export interface SubMindSettingsConfig {
  snapshotRefreshMs: number;
  secretAutoHideMs: number;
  guidanceAggression: GuidanceAggressionMode;
  actionRiskThreshold: ActionItem["riskLevel"];
  checkpointMode: CheckpointMode;
  projectStackDensity: ProjectStackDensity;
}

export type SettingsConfigDraft = SubMindSettingsConfig;
export type SettingsConfigKey = keyof SettingsConfigDraft;
export type SettingsConfigValue = SettingsConfigDraft[SettingsConfigKey];

export const defaultSettingsConfigDraft: SettingsConfigDraft = {
  snapshotRefreshMs: 5_000,
  secretAutoHideMs: 30_000,
  guidanceAggression: "balanced",
  actionRiskThreshold: "high",
  checkpointMode: "debounced",
  projectStackDensity: "balanced"
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

export function normalizeSettingsConfig(
  input: Partial<SettingsConfigDraft> | Record<string, unknown> | null | undefined
): SettingsConfigDraft {
  const source = input ?? {};
  const snapshotRefreshMs = Number(source.snapshotRefreshMs);
  const secretAutoHideMs = Number(source.secretAutoHideMs);

  return {
    snapshotRefreshMs: clampNumber(
      Number.isFinite(snapshotRefreshMs)
        ? snapshotRefreshMs
        : defaultSettingsConfigDraft.snapshotRefreshMs,
      1_000,
      60_000
    ),
    secretAutoHideMs: clampNumber(
      Number.isFinite(secretAutoHideMs)
        ? secretAutoHideMs
        : defaultSettingsConfigDraft.secretAutoHideMs,
      5_000,
      120_000
    ),
    guidanceAggression: pickEnumValue(
      source.guidanceAggression,
      guidanceAggressionModes,
      defaultSettingsConfigDraft.guidanceAggression
    ),
    actionRiskThreshold: pickEnumValue(
      source.actionRiskThreshold,
      ["low", "medium", "high", "critical"] as const,
      defaultSettingsConfigDraft.actionRiskThreshold
    ),
    checkpointMode: pickEnumValue(
      source.checkpointMode,
      checkpointModes,
      defaultSettingsConfigDraft.checkpointMode
    ),
    projectStackDensity: pickEnumValue(
      source.projectStackDensity,
      projectStackDensities,
      defaultSettingsConfigDraft.projectStackDensity
    )
  };
}
