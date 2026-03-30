import {
  checkpointKinds,
  deterministicWorkerKinds,
  modelWorkerKinds,
  type CheckpointKind,
  type DeterministicWorkerKind,
  type ModelWorkerKind
} from "@submind/shared-schemas";

export interface WorkerPlan {
  checkpoint: CheckpointKind;
  deterministic: DeterministicWorkerKind[];
  model: ModelWorkerKind[];
}

const defaultDeterministicWorkers = [...deterministicWorkerKinds];

const eventCheckpointModelWorkers: ModelWorkerKind[] = ["extraction"];
const threadCheckpointModelWorkers: ModelWorkerKind[] = [
  "summarization",
  "linking"
];
const sessionCheckpointModelWorkers: ModelWorkerKind[] = [
  "summarization",
  "ranking",
  "composition"
];
const guidanceCheckpointModelWorkers: ModelWorkerKind[] = [
  "ranking",
  "composition"
];
const actionCheckpointModelWorkers: ModelWorkerKind[] = [
  "extraction",
  "ranking"
];

export function createWorkerPlan(checkpoint: CheckpointKind): WorkerPlan {
  switch (checkpoint) {
    case "event":
      return {
        checkpoint,
        deterministic: defaultDeterministicWorkers,
        model: eventCheckpointModelWorkers
      };
    case "thread":
      return {
        checkpoint,
        deterministic: defaultDeterministicWorkers,
        model: threadCheckpointModelWorkers
      };
    case "session":
      return {
        checkpoint,
        deterministic: defaultDeterministicWorkers,
        model: sessionCheckpointModelWorkers
      };
    case "guidance":
      return {
        checkpoint,
        deterministic: defaultDeterministicWorkers,
        model: guidanceCheckpointModelWorkers
      };
    case "action":
      return {
        checkpoint,
        deterministic: defaultDeterministicWorkers,
        model: actionCheckpointModelWorkers
      };
    default:
      return {
        checkpoint,
        deterministic: defaultDeterministicWorkers,
        model: []
      };
  }
}

export const supportedCheckpoints = checkpointKinds;

