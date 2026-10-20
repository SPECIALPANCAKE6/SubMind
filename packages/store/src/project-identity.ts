import type { Project, SettingsConfigDraft } from "@submind/shared-schemas";
import {
  createProjectGroupingKey,
  createProjectIdFromWorkspacePath,
  normalizeSettingsConfig,
  normalizeWorkspacePath
} from "@submind/shared-schemas";
import type { SubMindStoreSnapshot } from "./index.js";

export type ProjectIdAliases = ReadonlyMap<string, string>;

export function normalizeProjectWorkspaceAliases(
  workspacePath: string | undefined,
  aliases: string[]
): string[] {
  const normalizedWorkspacePath = workspacePath
    ? normalizeWorkspacePath(workspacePath)
    : "";

  return [
    ...new Set(
      aliases
        .map(normalizeWorkspacePath)
        .filter((alias) => alias && alias !== normalizedWorkspacePath)
    )
  ];
}

export function createProjectIdAliases(projects: Project[]): Map<string, string> {
  const parentByProjectId = new Map<string, string>();
  const projectsById = new Map<string, Project[]>();
  const ownerByGroupingKey = new Map<string, string>();
  const projectIdAliases = new Map<string, string>();

  const find = (projectId: string): string => {
    const parent = parentByProjectId.get(projectId) ?? projectId;

    if (parent === projectId) {
      return projectId;
    }

    const root = find(parent);
    parentByProjectId.set(projectId, root);
    return root;
  };
  const union = (leftProjectId: string, rightProjectId: string): void => {
    const leftRoot = find(leftProjectId);
    const rightRoot = find(rightProjectId);

    if (leftRoot !== rightRoot) {
      parentByProjectId.set(rightRoot, leftRoot);
    }
  };

  for (const project of projects) {
    parentByProjectId.set(project.id, parentByProjectId.get(project.id) ?? project.id);
    projectsById.set(project.id, [...(projectsById.get(project.id) ?? []), project]);
    const locators = [project.workspacePath, ...(project.workspaceAliases ?? [])]
      .filter((value): value is string => Boolean(value))
      .map(createProjectGroupingKey)
      .filter(Boolean);

    for (const locator of locators) {
      const ownerProjectId = ownerByGroupingKey.get(locator);

      if (ownerProjectId) {
        union(project.id, ownerProjectId);
      } else {
        ownerByGroupingKey.set(locator, project.id);
      }
    }
  }

  const projectIdsByRoot = new Map<string, string[]>();
  for (const projectId of parentByProjectId.keys()) {
    const root = find(projectId);
    projectIdsByRoot.set(root, [...(projectIdsByRoot.get(root) ?? []), projectId]);
  }

  for (const projectIds of projectIdsByRoot.values()) {
    const candidates = projectIds
      .flatMap((projectId) => projectsById.get(projectId) ?? [])
      .filter((project) => project.workspacePath)
      .sort((left, right) => {
        const aliasCountDelta =
          (right.workspaceAliases?.length ?? 0) -
          (left.workspaceAliases?.length ?? 0);

        return (
          aliasCountDelta ||
          createProjectGroupingKey(left.workspacePath!).localeCompare(
            createProjectGroupingKey(right.workspacePath!)
          )
        );
      });
    const canonicalProject = candidates[0];

    if (!canonicalProject?.workspacePath) {
      continue;
    }

    const canonicalId = createProjectIdFromWorkspacePath(
      canonicalProject.workspacePath
    );
    for (const projectId of projectIds) {
      projectIdAliases.set(projectId, canonicalId);
    }
  }

  return projectIdAliases;
}

function resolveProjectId(aliases: ProjectIdAliases, projectId: string): string {
  return aliases.get(projectId) ?? projectId;
}

function createMemoryIdAliases(aliases: ProjectIdAliases): Map<string, string> {
  return new Map(
    [...aliases.entries()]
      .filter(([projectId, canonicalId]) => projectId !== canonicalId)
      .map(([projectId, canonicalId]) => [
        `memory-runtime-project-context-${projectId}`,
        `memory-runtime-project-context-${canonicalId}`
      ])
  );
}

export function reconcileStoreSnapshotProjectIdentity(
  snapshot: SubMindStoreSnapshot,
  aliases: ProjectIdAliases
): SubMindStoreSnapshot {
  if (aliases.size === 0) {
    return snapshot;
  }

  const memoryIdAliases = createMemoryIdAliases(aliases);
  const resolveMemoryId = (memoryId: string): string =>
    memoryIdAliases.get(memoryId) ?? memoryId;

  return {
    ...snapshot,
    profiles: snapshot.profiles.map((profile) => ({
      ...profile,
      ...(profile.defaultProjectId
        ? { defaultProjectId: resolveProjectId(aliases, profile.defaultProjectId) }
        : {})
    })),
    projects: snapshot.projects.map((project) => ({
      ...project,
      id: resolveProjectId(aliases, project.id),
      ...(project.workspaceAliases
        ? {
            workspaceAliases: normalizeProjectWorkspaceAliases(
              project.workspacePath,
              project.workspaceAliases
            )
          }
        : {})
    })),
    sessions: snapshot.sessions.map((item) => ({
      ...item,
      projectId: resolveProjectId(aliases, item.projectId)
    })),
    threads: snapshot.threads.map((item) => ({
      ...item,
      projectId: resolveProjectId(aliases, item.projectId)
    })),
    tasks: snapshot.tasks.map((item) => ({
      ...item,
      projectId: resolveProjectId(aliases, item.projectId)
    })),
    events: snapshot.events.map((item) => ({
      ...item,
      projectId: resolveProjectId(aliases, item.projectId),
      ...(item.memoryItemId
        ? { memoryItemId: resolveMemoryId(item.memoryItemId) }
        : {})
    })),
    fileChanges: snapshot.fileChanges.map((item) => ({
      ...item,
      projectId: resolveProjectId(aliases, item.projectId)
    })),
    memory: snapshot.memory.map((item) => ({
      ...item,
      id: resolveMemoryId(item.id),
      ...(item.projectId
        ? { projectId: resolveProjectId(aliases, item.projectId) }
        : {})
    })),
    guidance: snapshot.guidance.map((item) => ({
      ...item,
      projectId: resolveProjectId(aliases, item.projectId),
      linkedMemoryItemIds: item.linkedMemoryItemIds.map(resolveMemoryId)
    })),
    actions: snapshot.actions.map((item) => ({
      ...item,
      projectId: resolveProjectId(aliases, item.projectId)
    }))
  };
}

export function reconcileStoreSnapshotsProjectIdentity(
  snapshots: SubMindStoreSnapshot[]
): SubMindStoreSnapshot[] {
  const aliases = createProjectIdAliases(
    snapshots.flatMap((snapshot) => snapshot.projects)
  );
  const reconciledSnapshots = snapshots.map((snapshot) =>
    reconcileStoreSnapshotProjectIdentity(snapshot, aliases)
  );
  const projectsByCanonicalId = new Map<string, Project[]>();

  for (const project of reconciledSnapshots.flatMap((snapshot) => snapshot.projects)) {
    projectsByCanonicalId.set(project.id, [
      ...(projectsByCanonicalId.get(project.id) ?? []),
      project
    ]);
  }

  const identityByCanonicalId = new Map<
    string,
    { workspacePath?: string; workspaceAliases: string[] }
  >();
  for (const [projectId, projects] of projectsByCanonicalId) {
    const preferredProject = [...projects]
      .filter((project) => project.workspacePath)
      .sort((left, right) =>
        (right.workspaceAliases?.length ?? 0) -
          (left.workspaceAliases?.length ?? 0) ||
        createProjectGroupingKey(left.workspacePath!).localeCompare(
          createProjectGroupingKey(right.workspacePath!)
        )
      )[0];
    const workspacePath = preferredProject?.workspacePath
      ? normalizeWorkspacePath(preferredProject.workspacePath)
      : undefined;
    const workspaceAliases = normalizeProjectWorkspaceAliases(
      workspacePath,
      projects.flatMap((project) => [
        ...(project.workspaceAliases ?? []),
        ...(project.workspacePath ? [project.workspacePath] : [])
      ])
    );
    identityByCanonicalId.set(projectId, {
      ...(workspacePath ? { workspacePath } : {}),
      workspaceAliases
    });
  }

  return reconciledSnapshots.map((snapshot) => ({
    ...snapshot,
    projects: snapshot.projects.map((project) => {
      const identity = identityByCanonicalId.get(project.id);

      return identity
        ? {
            ...project,
            ...(identity.workspacePath
              ? { workspacePath: identity.workspacePath }
              : {}),
            ...(identity.workspaceAliases.length > 0
              ? { workspaceAliases: identity.workspaceAliases }
              : {})
          }
        : project;
    })
  }));
}

export function reconcileSettingsProjectIdentity(
  input: SettingsConfigDraft,
  aliases: ProjectIdAliases
): SettingsConfigDraft {
  const settings = normalizeSettingsConfig(input);
  const aliasedOverrides: SettingsConfigDraft["projectOverrides"] = {};
  const canonicalOverrides: SettingsConfigDraft["projectOverrides"] = {};

  for (const [projectId, projectOverride] of Object.entries(
    settings.projectOverrides
  )) {
    const canonicalId = resolveProjectId(aliases, projectId);
    const target = canonicalId === projectId ? canonicalOverrides : aliasedOverrides;
    target[canonicalId] = {
      ...target[canonicalId],
      ...projectOverride,
      projectId: canonicalId
    };
  }

  return normalizeSettingsConfig({
    ...settings,
    projectOverrides: Object.fromEntries(
      [...new Set([
        ...Object.keys(aliasedOverrides),
        ...Object.keys(canonicalOverrides)
      ])].map((projectId) => [
        projectId,
        {
          ...aliasedOverrides[projectId],
          ...canonicalOverrides[projectId],
          projectId
        }
      ])
    )
  });
}
