export const deterministicWorkerKinds = [
  "ingestion",
  "normalization",
  "lifecycle updates",
  "policy enforcement",
  "indexing",
  "validation"
] as const;

export type DeterministicWorkerKind = (typeof deterministicWorkerKinds)[number];

export const modelWorkerKinds = [
  "summarization",
  "extraction",
  "ranking",
  "composition",
  "linking",
  "enrichment"
] as const;

export type ModelWorkerKind = (typeof modelWorkerKinds)[number];

export const checkpointKinds = [
  "event",
  "thread",
  "session",
  "guidance",
  "action"
] as const;

export type CheckpointKind = (typeof checkpointKinds)[number];

