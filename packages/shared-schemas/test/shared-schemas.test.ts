import { describe, expect, it } from "vitest";

import {
  contextDatumKinds,
  contextSourceEntityKinds,
  coreEntityKinds,
  currentSettingsConfigVersion,
  defaultAppSettingsConfig,
  defaultProfileSettingsConfig,
  defaultSettingsConfigDraft,
  eventOrigins,
  eventNodeCategories,
  eventTaxonomy,
  getProjectSettingsOverrideCount,
  normalizeSettingsConfig,
  resolveEffectiveSettingsConfig,
  settingsConfigEditableKeys,
  settingsScopes,
  settingsConfigStorageKey,
  updateSettingsConfigValue,
  projectStackInteractionRules,
  projectStackTransitions,
  guidanceAggressionModes,
  checkpointModes,
  projectStackDensities
} from "../src/index";

describe("shared schemas", () => {
  it("keeps the core entity set aligned with AGENTS.md", () => {
    expect(coreEntityKinds).toEqual([
      "Profile",
      "Project",
      "Session",
      "Thread",
      "Task",
      "Event",
      "FileChange",
      "MemoryItem",
      "GuidanceItem",
      "ActionItem"
    ]);
  });

  it("keeps the locked event taxonomy intact", () => {
    expect(eventTaxonomy).toEqual([
      "lifecycle",
      "work_change",
      "guidance",
      "memory",
      "action",
      "subagent",
      "system_user"
    ]);

    expect(eventOrigins).toEqual([
      "agent",
      "codex",
      "submind",
      "subagent",
      "system",
      "user"
    ]);

    expect(eventNodeCategories).toEqual([
      "anchor",
      "change",
      "cognitive",
      "control",
      "delegation",
      "marker"
    ]);
  });

  it("preserves the project stack interaction model", () => {
    expect(projectStackInteractionRules).toEqual({
      select: "single_click",
      focus: "explicit_action_or_double_click"
    });
    expect(projectStackTransitions.focused).toEqual(["selected"]);
  });

  it("defines the context bundle source vocabulary", () => {
    expect(contextDatumKinds).toEqual([
      "project_context",
      "memory",
      "guidance",
      "task",
      "recent_change",
      "pending_action"
    ]);
    expect(contextSourceEntityKinds).toEqual([
      "Project",
      "MemoryItem",
      "GuidanceItem",
      "Task",
      "Event",
      "FileChange",
      "ActionItem"
    ]);
  });

  it("defines and normalizes the settings config contract", () => {
    expect(defaultSettingsConfigDraft.version).toBe(currentSettingsConfigVersion);
    expect(defaultSettingsConfigDraft.app).toEqual(defaultAppSettingsConfig);
    expect(defaultSettingsConfigDraft.profile).toEqual(
      defaultProfileSettingsConfig
    );
    expect(defaultSettingsConfigDraft.projectOverrides).toEqual({});
    expect(settingsScopes).toEqual(["app", "profile", "project"]);
    expect(settingsConfigStorageKey).toBe("settings_config");
    expect(settingsConfigEditableKeys).toEqual([
      "snapshotRefreshMs",
      "secretAutoHideMs",
      "guidanceAggression",
      "actionRiskThreshold",
      "checkpointMode",
      "projectStackDensity"
    ]);
    expect(guidanceAggressionModes).toEqual([
      "restrained",
      "balanced",
      "assertive"
    ]);
    expect(checkpointModes).toEqual([
      "immediate",
      "debounced",
      "manual_review"
    ]);
    expect(projectStackDensities).toEqual([
      "compact",
      "balanced",
      "expanded"
    ]);
    expect(normalizeSettingsConfig({
      snapshotRefreshMs: 90_000,
      secretAutoHideMs: 1_000,
      guidanceAggression: "assertive"
    })).toMatchObject({
      version: currentSettingsConfigVersion,
      app: {
        scope: "app",
        snapshotRefreshMs: 60_000
      },
      profile: {
        scope: "profile",
        secretAutoHideMs: 5_000,
        guidanceAggression: "assertive"
      },
      projectOverrides: {}
    });
  });

  it("resolves effective settings with project overrides only when focused", () => {
    const profileDefault = updateSettingsConfigValue(
      defaultSettingsConfigDraft,
      "guidanceAggression",
      "restrained"
    );
    const projectOverride = updateSettingsConfigValue(
      profileDefault,
      "guidanceAggression",
      "assertive",
      { projectId: "project-submind" }
    );

    expect(resolveEffectiveSettingsConfig(projectOverride, null)).toMatchObject({
      projectId: null,
      guidanceAggression: "restrained",
      sourceScopes: {
        guidanceAggression: "profile"
      }
    });
    expect(
      resolveEffectiveSettingsConfig(projectOverride, "project-submind")
    ).toMatchObject({
      projectId: "project-submind",
      guidanceAggression: "assertive",
      sourceScopes: {
        guidanceAggression: "project"
      }
    });
    expect(
      getProjectSettingsOverrideCount(projectOverride, "project-submind")
    ).toBe(1);
  });
});
