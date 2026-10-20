import type { Event, GuidanceItem, Task } from "@submind/shared-schemas";
import { redactSensitiveText } from "@submind/policy";
import type { SubMindRepository } from "@submind/store";

let deliveryEventSequence = 0;

export type ActiveSessionProposal =
  | { kind: "Task"; item: Task }
  | { kind: "GuidanceItem"; item: GuidanceItem };

export interface ActiveSessionTarget {
  projectId: string;
  sessionId: string;
  threadId: string;
}

export interface ActiveSessionDeliveryAdapter {
  readonly id: string;
  deliverMessage(input: {
    target: ActiveSessionTarget;
    proposal: { kind: ActiveSessionProposal["kind"]; id: string };
    message: string;
  }): Promise<{ deliveryId: string }>;
}

export interface ActiveSessionDeliveryResult {
  deliveryEventId: string;
  deliveryId: string;
}

function createDeliveryEvent(
  proposal: ActiveSessionProposal,
  target: ActiveSessionTarget,
  adapterId: string,
  eventType: string,
  timestamp: string,
  details: Record<string, unknown> = {}
): Event {
  const { item } = proposal;
  return {
    kind: "Event",
    id: `event-${eventType}-${item.id}-${timestamp.replaceAll(/[^0-9]/g, "")}-${++deliveryEventSequence}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    projectId: target.projectId,
    sessionId: target.sessionId,
    threadId: target.threadId,
    ...(proposal.kind === "Task"
      ? { taskId: item.id }
      : { guidanceItemId: item.id }),
    originType: "submind",
    eventType,
    category: "action",
    nodeCategory: "control",
    timestamp,
    summary: `SubMind ${proposal.kind} ${item.id} active-session delivery ${eventType.replace("proposal-session-push-", "")}.`,
    metadata: {
      adapterId,
      proposalKind: proposal.kind,
      proposalId: item.id,
      target,
      ...details
    }
  };
}

function createOperatorMessage(proposal: ActiveSessionProposal): string {
  if (proposal.kind === "Task") {
    return [
      "Operator-approved SubMind task context:",
      `Task: ${proposal.item.title}`,
      `Status: ${proposal.item.status}`,
      proposal.item.summary
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    "Operator-approved SubMind guidance:",
    `Guidance: ${proposal.item.title}`,
    `Summary: ${proposal.item.summary}`,
    `Rationale: ${proposal.item.rationale}`
  ].join("\n");
}

export function assertProposalDeliverable(
  proposal: ActiveSessionProposal,
  snapshot: Awaited<ReturnType<SubMindRepository["getSnapshot"]>>,
  target: ActiveSessionTarget
): void {
  const session = snapshot.sessions.find((item) => item.id === target.sessionId);
  const thread = snapshot.threads.find((item) => item.id === target.threadId);
  if (
    !session ||
    session.status !== "active" ||
    session.projectId !== target.projectId ||
    !thread ||
    thread.status !== "open" ||
    thread.sessionId !== target.sessionId ||
    thread.projectId !== target.projectId
  ) {
    throw new Error("Select an active session and open thread in the proposal's project before pushing.");
  }
  if (proposal.item.projectId !== target.projectId) {
    throw new Error("The proposal and active session must belong to the same project.");
  }
  if (proposal.kind === "Task") {
    if (
      proposal.item.status === "proposed" ||
      proposal.item.status === "rejected" ||
      proposal.item.status === "completed" ||
      proposal.item.sessionId !== target.sessionId ||
      proposal.item.threadId !== target.threadId
    ) {
      throw new Error("Only an accepted, unresolved task in the active thread can be pushed.");
    }
  } else if (
    ["candidate", "suppressed", "resolved"].includes(proposal.item.state) ||
    (proposal.item.sessionId && proposal.item.sessionId !== target.sessionId) ||
    (proposal.item.threadId && proposal.item.threadId !== target.threadId)
  ) {
    throw new Error("Only reviewed guidance matching the active session scope can be pushed.");
  }
}

export async function pushProposalToActiveSession(
  repository: SubMindRepository,
  adapter: ActiveSessionDeliveryAdapter,
  proposal: ActiveSessionProposal,
  target: ActiveSessionTarget,
  now: () => string = () => new Date().toISOString()
): Promise<ActiveSessionDeliveryResult> {
  if (!adapter.id.trim()) {
    throw new Error("The active-session adapter must provide a stable identifier.");
  }
  const snapshot = await repository.getSnapshot();
  assertProposalDeliverable(proposal, snapshot, target);

  const startedAt = now();
  const requestedEvent = createDeliveryEvent(
    proposal,
    target,
    adapter.id,
    "proposal-session-push-requested",
    startedAt
  );
  await repository.appendEvents([requestedEvent]);

  let deliveryId: string;
  try {
    const receipt = await adapter.deliverMessage({
      target,
      proposal: { kind: proposal.kind, id: proposal.item.id },
      message: createOperatorMessage(proposal)
    });
    if (!receipt.deliveryId.trim()) {
      throw new Error("The active-session adapter returned no delivery identifier.");
    }
    deliveryId = receipt.deliveryId.trim();
  } catch (error) {
    const failedAt = now();
    const reason = redactSensitiveText(
      error instanceof Error ? error.message : String(error)
    ).value;
    try {
      await repository.appendEvents([
        createDeliveryEvent(proposal, target, adapter.id, "proposal-session-push-failed", failedAt, {
          requestEventId: requestedEvent.id,
          error: reason
        })
      ]);
    } catch (auditError) {
      throw new Error(
        `Active-session delivery failed (${reason}) and its failure could not be audited: ${
          auditError instanceof Error ? auditError.message : String(auditError)
        }`
      );
    }
    throw new Error(`Active-session delivery failed: ${reason}`);
  }

  const deliveredAt = now();
  const deliveredEvent = createDeliveryEvent(
    proposal,
    target,
    adapter.id,
    "proposal-session-push-delivered",
    deliveredAt,
    { requestEventId: requestedEvent.id, deliveryId }
  );
  try {
    await repository.appendEvents([deliveredEvent]);
  } catch (error) {
    throw new Error(
      `The active session accepted delivery ${deliveryId}, but SubMind could not persist its delivery audit: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  return { deliveryEventId: deliveredEvent.id, deliveryId };
}
