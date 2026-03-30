export const starterSubagents = [
  "repo-explorer",
  "design-reviewer",
  "doc-researcher",
  "test-auditor"
] as const;

export type StarterSubagent = (typeof starterSubagents)[number];

export interface SubagentInvocationRequest {
  subagent: StarterSubagent;
  justification: string;
  proposedAction: "read" | "propose" | "execute";
}

export function requiresExecutionGate(
  request: SubagentInvocationRequest
): boolean {
  return request.proposedAction === "execute";
}

