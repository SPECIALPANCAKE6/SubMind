import type { ProjectStackState } from "@submind/shared-schemas";

export const shellViews = ["operator", "focus", "tab"] as const;

export type ShellView = (typeof shellViews)[number];

export interface ProjectStackSelection {
  projectId: string;
  state: ProjectStackState;
}

export function createProjectStackSelection(
  projectId: string
): ProjectStackSelection {
  return {
    projectId,
    state: "unselected"
  };
}

export function selectProject(
  selection: ProjectStackSelection
): ProjectStackSelection {
  return {
    ...selection,
    state: "selected"
  };
}

export function focusProject(
  selection: ProjectStackSelection
): ProjectStackSelection {
  return {
    ...selection,
    state: "focused"
  };
}

export function clearProjectFocus(
  selection: ProjectStackSelection
): ProjectStackSelection {
  return {
    ...selection,
    state: "selected"
  };
}

