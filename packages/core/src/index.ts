import type { Project, Session, Thread } from "@submind/shared-schemas";

export interface SubMindRuntimeContext {
  scope: "global" | "project";
  project?: Project;
  activeSession?: Session;
  activeThread?: Thread;
}

export function describeRuntimeContext(context: SubMindRuntimeContext) {
  return {
    scope: context.scope,
    projectId: context.project?.id ?? null,
    projectName: context.project?.name ?? null,
    activeSessionId: context.activeSession?.id ?? null,
    activeThreadId: context.activeThread?.id ?? null
  };
}
