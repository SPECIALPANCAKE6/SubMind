import type { Event, FileChange, ISODateString } from "@submind/shared-schemas";

export interface CodexProtocolEnvelope {
  source: "codex";
  receivedAt: ISODateString;
  sessionId: string;
  threadId: string;
  events: Event[];
  fileChanges: FileChange[];
}

export function createEmptyCodexProtocolEnvelope(
  sessionId: string,
  threadId: string,
  receivedAt: ISODateString
): CodexProtocolEnvelope {
  return {
    source: "codex",
    receivedAt,
    sessionId,
    threadId,
    events: [],
    fileChanges: []
  };
}

