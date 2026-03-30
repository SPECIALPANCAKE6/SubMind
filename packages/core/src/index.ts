import type { Project, Session, Thread } from "@submind/shared-schemas";

export interface SubMindRuntimeContext {
  project: Project;
  activeSession?: Session;
  activeThread?: Thread;
}

export function describeRuntimeContext(context: SubMindRuntimeContext) {
  return {
    projectId: context.project.id,
    projectName: context.project.name,
    projectState: context.project.state,
    activeSessionId: context.activeSession?.id ?? null,
    activeThreadId: context.activeThread?.id ?? null
  };
}

