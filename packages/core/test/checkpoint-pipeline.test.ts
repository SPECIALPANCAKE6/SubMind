import { describe, expect, it } from "vitest";
import {
  createActiveSessionGeneratedDelivery,
  createCheckpointPipeline,
  type ActiveSessionDeliveryAdapter
} from "../src/index";
import {
  createPreviewRepository,
  createPreviewStoreSnapshot,
  type SubMindRepository
} from "../../store/src/index";
import type { ModelWorkerAdapter } from "../../workers/src/index";

function createFixture() {
  const snapshot = createPreviewStoreSnapshot();
  const thread = snapshot.threads.find(
    (item) => item.id === "thread-submind-migration"
  )!;
  const sourceEvent = snapshot.events.find(
    (item) => item.threadId === thread.id
  )!;
  const modelAdapter: ModelWorkerAdapter = {
    execute: async ({ worker }) => ({
      model: "test-model",
      output:
        worker === "extraction"
          ? {
              memories: [
                {
                  bucket: "architecture_notes",
                  summary: "Pipeline persists drafts",
                  content: "Generated memory is stored for review.",
                  confidence: 0.9,
                  sourceEventIds: [sourceEvent.id],
                  sourceFileChangeIds: []
                }
              ]
            }
          : worker === "task_synthesis"
            ? {
                tasks: [
                  {
                    title: "Review pipeline output",
                    summary: "Check the generated task.",
                    status: "active",
                    priority: "high",
                    sourceEventIds: [sourceEvent.id]
                  }
                ]
              }
            : {}
    })
  };
  return { snapshot, thread, modelAdapter };
}

describe("checkpoint pipeline", () => {
  it("runs a triggered checkpoint through the executor and persists worker results", async () => {
    const { snapshot, thread, modelAdapter } = createFixture();
    const repository = createPreviewRepository(snapshot);
    const results: unknown[] = [];
    const pipeline = createCheckpointPipeline({
      getRepository: async () => repository,
      adapter: modelAdapter,
      debounceMs: 0,
      onResult: (result) => results.push(result)
    });

    pipeline.trigger("thread", { threadId: thread.id });
    await pipeline.flush();
    pipeline.dispose();

    expect(results).toHaveLength(1);
    const stored = await repository.getSnapshot();
    expect(
      stored.memory.some((item) => item.summary === "Pipeline persists drafts")
    ).toBe(true);
    expect(
      stored.tasks.some(
        (item) => item.title === "Review pipeline output" && item.status === "proposed"
      )
    ).toBe(true);
    const audit = stored.events.find((event) => event.eventType === "model-checkpoint-run");
    expect(audit?.metadata).toMatchObject({ checkpoint: "thread", status: "completed" });
  });

  it("audits worker results and reports an error when proposals cannot be persisted", async () => {
    const { snapshot, thread, modelAdapter } = createFixture();
    const base = createPreviewRepository(snapshot);
    const repository: SubMindRepository = {
      ...base,
      async appendGeneratedProposals() {
        throw new Error("disk full");
      }
    };
    const pipeline = createCheckpointPipeline({
      getRepository: async () => repository,
      adapter: modelAdapter
    });

    await expect(
      pipeline.execute("thread", { threadId: thread.id })
    ).rejects.toThrow(/could not be persisted: disk full/);
    const stored = await base.getSnapshot();
    const audit = stored.events.find((event) => event.eventType === "model-checkpoint-run");
    expect(audit?.metadata).toMatchObject({ persistenceError: "disk full" });
    pipeline.dispose();
  });

  it("feeds persisted content to delivery but never pushes unreviewed proposals", async () => {
    const { snapshot, thread, modelAdapter } = createFixture();
    const repository = createPreviewRepository(snapshot);
    const delivered: string[] = [];
    const sessionAdapter: ActiveSessionDeliveryAdapter = {
      id: "test-adapter",
      async deliverMessage({ proposal }) {
        delivered.push(proposal.id);
        return { deliveryId: "delivery-1" };
      }
    };
    const pipeline = createCheckpointPipeline({
      getRepository: async () => repository,
      adapter: modelAdapter,
      delivery: createActiveSessionGeneratedDelivery({
        repository,
        adapter: sessionAdapter
      })
    });

    const result = await pipeline.execute("thread", { threadId: thread.id });

    expect(result.proposals.tasks).toHaveLength(1);
    expect(result.delivery).toHaveLength(1);
    expect(result.delivery[0]).toMatchObject({ kind: "Task", status: "skipped" });
    expect(delivered).toEqual([]);
    pipeline.dispose();
  });

  it("isolates delivery failures from the persisted run", async () => {
    const { snapshot, thread, modelAdapter } = createFixture();
    const repository = createPreviewRepository(snapshot);
    const pipeline = createCheckpointPipeline({
      getRepository: async () => repository,
      adapter: modelAdapter,
      delivery: {
        async deliver() {
          throw new Error("delivery unavailable");
        }
      }
    });

    const result = await pipeline.execute("thread", { threadId: thread.id });

    expect(result.delivery).toEqual([
      {
        kind: "Batch",
        id: result.run.projectId,
        status: "failed",
        reason: "delivery unavailable"
      }
    ]);
    const stored = await repository.getSnapshot();
    expect(stored.events.some((event) => event.id === result.auditEventId)).toBe(true);
    pipeline.dispose();
  });
});
