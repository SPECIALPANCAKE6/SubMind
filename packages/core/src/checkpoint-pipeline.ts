import type { CheckpointKind } from "@submind/shared-schemas";
import { redactSensitiveText } from "@submind/policy";
import type { SubMindRepository, SubMindStoreSnapshot } from "@submind/store";
import {
  createCheckpointRunAuditEvent,
  createGeneratedCheckpointProposals,
  executeCheckpointModelWorkers,
  type CheckpointWorkerRun,
  type GeneratedCheckpointProposals,
  type ModelWorkerAdapter
} from "@submind/workers";
import {
  createCheckpointTriggerCoordinator,
  type CheckpointTriggerCoordinatorOptions,
  type CheckpointTriggerScope
} from "./checkpoint-triggers.js";
import {
  assertProposalDeliverable,
  pushProposalToActiveSession,
  type ActiveSessionDeliveryAdapter,
  type ActiveSessionProposal,
  type ActiveSessionTarget
} from "./proposal-delivery.js";

export interface GeneratedContentDeliveryOutcome {
  /** "Batch" marks a failure of the delivery step itself. */
  kind: "Task" | "GuidanceItem" | "Batch";
  id: string;
  status: "delivered" | "skipped" | "failed";
  reason?: string;
  deliveryId?: string;
}

/** Receives content that has already been persisted by a checkpoint run. */
export interface GeneratedContentDelivery {
  deliver(input: {
    run: CheckpointWorkerRun;
    proposals: GeneratedCheckpointProposals;
  }): Promise<GeneratedContentDeliveryOutcome[]>;
}

export interface CheckpointPipelineResult {
  run: CheckpointWorkerRun;
  proposals: GeneratedCheckpointProposals;
  auditEventId: string;
  delivery: GeneratedContentDeliveryOutcome[];
}

export interface CheckpointPipelineOptions {
  /** Resolved lazily so the pipeline can be created before storage is ready. */
  getRepository(): Promise<SubMindRepository>;
  adapter: ModelWorkerAdapter;
  delivery?: GeneratedContentDelivery;
  debounceMs?: number;
  maxDebounceMs?: number;
  /** Durable trigger queue; see `CheckpointTriggerCoordinatorOptions.queue`. */
  queue?: CheckpointTriggerCoordinatorOptions["queue"];
  maxQueuedAgeMs?: number;
  onQueueError?(error: unknown): void;
  onResult?(result: CheckpointPipelineResult): void;
  onError?(
    error: unknown,
    checkpoint: CheckpointKind,
    scope: CheckpointTriggerScope
  ): void;
}

function errorMessage(error: unknown): string {
  return redactSensitiveText(
    error instanceof Error ? error.message : String(error)
  ).value;
}

/**
 * Generated Tasks and Guidance are handed to active-session delivery only when
 * they already satisfy the operator-approval rules. Freshly generated
 * proposals therefore remain "skipped" until an operator reviews them.
 */
export function createActiveSessionGeneratedDelivery(options: {
  repository: SubMindRepository;
  adapter: ActiveSessionDeliveryAdapter;
  now?: () => string;
}): GeneratedContentDelivery {
  return {
    async deliver({ run, proposals }) {
      const snapshot = await options.repository.getSnapshot();
      const candidates: ActiveSessionProposal[] = [
        ...proposals.tasks.map((item) => ({ kind: "Task" as const, item })),
        ...proposals.guidance.map((item) => ({
          kind: "GuidanceItem" as const,
          item
        }))
      ];
      const outcomes: GeneratedContentDeliveryOutcome[] = [];

      for (const generated of candidates) {
        const { kind } = generated;
        const id = generated.item.id;
        const stored = (
          kind === "Task"
            ? snapshot.tasks.find((item) => item.id === id)
            : snapshot.guidance.find((item) => item.id === id)
        ) as ActiveSessionProposal["item"] | undefined;
        if (!stored) {
          outcomes.push({ kind, id, status: "skipped", reason: "The proposal was not persisted." });
          continue;
        }
        const proposal = { kind, item: stored } as ActiveSessionProposal;
        const sessionId = stored.sessionId ?? run.scope.sessionId;
        const threadId = stored.threadId ?? run.scope.threadId;
        if (!sessionId || !threadId) {
          outcomes.push({ kind, id, status: "skipped", reason: "No active session thread is in scope." });
          continue;
        }
        const target: ActiveSessionTarget = {
          projectId: run.projectId,
          sessionId,
          threadId
        };
        try {
          assertProposalDeliverable(proposal, snapshot, target);
        } catch (error) {
          outcomes.push({ kind, id, status: "skipped", reason: errorMessage(error) });
          continue;
        }
        try {
          const receipt = await pushProposalToActiveSession(
            options.repository,
            options.adapter,
            proposal,
            target,
            options.now
          );
          outcomes.push({ kind, id, status: "delivered", deliveryId: receipt.deliveryId });
        } catch (error) {
          outcomes.push({ kind, id, status: "failed", reason: errorMessage(error) });
        }
      }
      return outcomes;
    }
  };
}

/**
 * Composes trigger coordinator -> model worker executor -> persistence ->
 * delivery. The coordinator owns debouncing and serial execution.
 */
export function createCheckpointPipeline(options: CheckpointPipelineOptions) {
  async function execute(
    checkpoint: CheckpointKind,
    scope: CheckpointTriggerScope
  ): Promise<CheckpointPipelineResult> {
    const repository = await options.getRepository();
    const snapshot: SubMindStoreSnapshot = await repository.getSnapshot();
    const run = await executeCheckpointModelWorkers(snapshot, {
      checkpoint,
      scope,
      adapter: options.adapter
    });
    const proposals = createGeneratedCheckpointProposals(snapshot, run);

    let persistenceError: unknown;
    try {
      await repository.appendGeneratedProposals(proposals);
    } catch (error) {
      persistenceError = error;
    }

    // The worker results are always audited, including when proposal persistence fails.
    const audit = createCheckpointRunAuditEvent(
      run,
      persistenceError ? undefined : proposals
    );
    if (persistenceError) {
      audit.metadata = {
        ...audit.metadata,
        persistenceError: errorMessage(persistenceError)
      };
      audit.summary = `${audit.summary} Generated proposals were not persisted.`;
    }
    await repository.appendEvents([audit]);
    if (persistenceError) {
      throw new Error(
        `Checkpoint ${checkpoint} proposals could not be persisted: ${errorMessage(persistenceError)}`
      );
    }

    let delivery: GeneratedContentDeliveryOutcome[] = [];
    if (options.delivery) {
      try {
        delivery = await options.delivery.deliver({ run, proposals });
      } catch (error) {
        delivery = [
          {
            kind: "Batch",
            id: run.projectId,
            status: "failed",
            reason: errorMessage(error)
          }
        ];
      }
    }

    const result: CheckpointPipelineResult = {
      run,
      proposals,
      auditEventId: audit.id,
      delivery
    };
    options.onResult?.(result);
    return result;
  }

  const coordinator = createCheckpointTriggerCoordinator({
    ...(options.debounceMs !== undefined ? { debounceMs: options.debounceMs } : {}),
    ...(options.maxDebounceMs !== undefined
      ? { maxDebounceMs: options.maxDebounceMs }
      : {}),
    ...(options.queue ? { queue: options.queue } : {}),
    ...(options.maxQueuedAgeMs !== undefined
      ? { maxQueuedAgeMs: options.maxQueuedAgeMs }
      : {}),
    ...(options.onQueueError ? { onQueueError: options.onQueueError } : {}),
    async runCheckpoint(checkpoint, scope) {
      await execute(checkpoint, scope);
    },
    ...(options.onError ? { onError: options.onError } : {})
  });

  return {
    observe: coordinator.observe,
    trigger: coordinator.trigger,
    restore: coordinator.restore,
    settled: coordinator.settled,
    flush: coordinator.flush,
    dispose: coordinator.dispose,
    execute,
    runNow: execute
  };
}
