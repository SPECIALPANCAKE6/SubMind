import type { Event, FileChange, Profile, Project, Session, Task, Thread } from "./entities.js";

/** Harness IDs describe provenance, never project identity or a model vendor. */
export type AgentHarnessId = string;

export interface AgentCapabilities {
  observation: { history: boolean; fileChanges: boolean };
  contextDelivery: readonly ("context_api" | "mcp")[];
  execution: { messages: boolean; actions: boolean; approvals: boolean };
}

export interface ObservedAgentWork {
  profiles: Profile[];
  projects: Project[];
  sessions: Session[];
  threads: Thread[];
  tasks: Task[];
  events: Event[];
  fileChanges: FileChange[];
}

/** Transport acquisition stays in the adapter/host; normalization is deterministic. */
export interface AgentAdapter<Feed, Work extends ObservedAgentWork = ObservedAgentWork> {
  harnessId: AgentHarnessId;
  capabilities: AgentCapabilities;
  normalize(feed: Feed, now?: number): Work;
}

export const historyObservationCapabilities: AgentCapabilities = {
  observation: { history: true, fileChanges: true },
  contextDelivery: [],
  execution: { messages: false, actions: false, approvals: false }
};

/** Available service interfaces; this does not promise any harness has connected. */
export const contextServiceCapabilities: AgentCapabilities = {
  observation: { history: false, fileChanges: false },
  contextDelivery: ["context_api", "mcp"],
  execution: { messages: false, actions: false, approvals: false }
};

/** Normalize new observations while keeping legacy event IDs. Stored legacy origins remain readable. */
export function annotateAgentWork<T extends ObservedAgentWork>(work: T, harnessId: string): T {
  validateObservedAgentWork(work);
  return {
    ...work,
    events: work.events.map(event => ({
      ...event,
      originType: event.originType === "codex" || event.originType === "system" ? "agent" : event.originType,
      metadata: { ...event.metadata, harnessId }
    }))
  };
}

export function validateObservedAgentWork(work: ObservedAgentWork): void {
  const projects = new Map(work.projects.map(item => [item.id, item]));
  const sessions = new Map(work.sessions.map(item => [item.id, item]));
  const threads = new Map(work.threads.map(item => [item.id, item]));
  const tasks = new Map(work.tasks.map(item => [item.id, item]));
  for (const session of work.sessions) {
    if (projects.get(session.projectId)?.profileId !== session.profileId) throw new Error(`Invalid session scope: ${session.id}`);
  }
  for (const thread of work.threads) {
    if (sessions.get(thread.sessionId)?.projectId !== thread.projectId) throw new Error(`Invalid thread scope: ${thread.id}`);
  }
  for (const item of [...work.tasks, ...work.events, ...work.fileChanges]) {
    if (!projects.has(item.projectId) ||
        (item.sessionId && sessions.get(item.sessionId)?.projectId !== item.projectId) ||
        (item.threadId && (threads.get(item.threadId)?.projectId !== item.projectId ||
          (item.sessionId && threads.get(item.threadId)?.sessionId !== item.sessionId)))) {
      throw new Error(`Invalid work scope: ${item.id}`);
    }
    if ("taskId" in item && item.taskId) {
      const task = tasks.get(item.taskId);
      if (!task || task.projectId !== item.projectId ||
          (item.threadId && task.threadId !== item.threadId) ||
          (item.sessionId && task.sessionId !== item.sessionId)) {
        throw new Error(`Invalid task scope: ${item.id}`);
      }
    }
  }
}

export function getEventHarness(event: Event): string | undefined {
  if (typeof event.metadata.harnessId === "string") return event.metadata.harnessId;
  if (typeof event.metadata.source === "string") {
    for (const legacy of ["codex", "copilot", "hermes"]) {
      if (event.metadata.source === legacy || event.metadata.source.startsWith(`${legacy}_`)) return legacy;
    }
  }
  return event.originType === "codex" ? "codex" : undefined;
}
