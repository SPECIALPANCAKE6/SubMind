import { validateObservedAgentWork, annotateAgentWork } from "../../shared-schemas/src/index";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { collectAgentObservations, createAgentObservationSource, createWorkTraceEnvelope, createObservationRefresh, pushProposalToActiveSession } from "../src/index";
import { codexAdapter } from "../../protocol-codex/src/index";
import { hermesAdapter } from "../../protocol-hermes/src/index";
import { createPreviewRepository, createPreviewStoreSnapshot, createSqliteRepository, syncRuntimeSnapshotIntoDatabase } from "../../store/src/index";
import { createContextBundle, createContextSupplyAuditEvent } from "../../workers/src/index";
import {
  createCheckpointTriggerCoordinator,
  type CheckpointTriggerScope
} from "../src/index";

const now = Date.parse("2026-09-13T04:00:00Z");
const path = "C:/workspace/continuity";
const codex = () => codexAdapter.normalize({
  profileName: "Operator",
  threads: [{ id: "past-work", title: "Use one inventory authority", cwd: path,
    createdAt: now / 1000 - 100, updatedAt: now / 1000 - 20,
    gitBranch: null, gitOriginUrl: null, firstUserMessage: "Keep inventory state in one authority", descriptorHints: [] }],
  events: [{ id: "inventory-evidence", threadId: "past-work", timestamp: new Date(now - 20_000).toISOString(),
    type: "agent_message", summary: "Inventory state belongs in the shared store; UI reads it.", metadata: {} }],
  fileChanges: []
}, now);
const hermes = () => hermesAdapter.normalize({ profileName: "Operator", threads: [{
  id: "later-work", title: "Extend inventory UI", workspacePath: path,
  createdAt: now, updatedAt: now, latestUserMessage: "Where should inventory state live?",
  modelName: null, modelId: null, descriptorHints: [], turns: [{
    id: "question", timestamp: now, prompt: "Where should inventory state live?", response: null,
    modelId: null, toolNames: [], referencedFiles: [], fileChanges: []
  }]
}] }, now);

function database() {
  const raw = new DatabaseSync(":memory:");
  const bind = (values: unknown[] = []) => Object.fromEntries(values.map((v, i) => [String(i + 1), v]));
  return {
    raw,
    async select<T>(sql: string, values?: unknown[]) { return raw.prepare(sql).all(bind(values)) as T; },
    async execute(sql: string, values?: unknown[]) {
      const result = raw.prepare(sql).run(bind(values));
      return { rowsAffected: Number(result.changes), lastInsertId: Number(result.lastInsertRowid) };
    }
  };
}

describe("cross-harness continuity", () => {
  it("pushes an operator-approved proposal through an explicit active-session adapter and audits delivery", async () => {
    const snapshot = createPreviewStoreSnapshot();
    const task = snapshot.tasks.find((item) => item.status === "active")!;
    const repository = createPreviewRepository(snapshot);
    const messages: string[] = [];
    let timestamp = 0;
    const result = await pushProposalToActiveSession(
      repository,
      {
        id: "test-session-adapter",
        async deliverMessage(input) {
          messages.push(input.message);
          expect(input.target.threadId).toBe(task.threadId);
          return { deliveryId: "harness-message-42" };
        }
      },
      { kind: "Task", item: task },
      {
        projectId: task.projectId,
        sessionId: task.sessionId,
        threadId: task.threadId
      },
      () => new Date(Date.parse("2026-09-13T04:00:00Z") + timestamp++ * 1000).toISOString()
    );

    expect(messages[0]).toContain("Operator-approved SubMind task context");
    expect(result.deliveryId).toBe("harness-message-42");
    const deliveryEvents = (await repository.getEventHistory({ taskId: task.id }))
      .filter((event) => event.eventType.startsWith("proposal-session-push-"));
    expect(deliveryEvents.map((event) => event.eventType)).toEqual([
      "proposal-session-push-delivered",
      "proposal-session-push-requested"
    ]);
  });

  it("audits adapter failures and does not turn them into a successful delivery", async () => {
    const snapshot = createPreviewStoreSnapshot();
    const task = snapshot.tasks.find((item) => item.status === "active")!;
    const repository = createPreviewRepository(snapshot);
    await expect(
      pushProposalToActiveSession(
        repository,
        {
          id: "failing-session-adapter",
          async deliverMessage() {
            throw new Error("active session is disconnected");
          }
        },
        { kind: "Task", item: task },
        {
          projectId: task.projectId,
          sessionId: task.sessionId,
          threadId: task.threadId
        }
      )
    ).rejects.toThrow("Active-session delivery failed: active session is disconnected");
    expect(
      (await repository.getEventHistory({ taskId: task.id }))
        .some((event) => event.eventType === "proposal-session-push-failed")
    ).toBe(true);
  });

  it("debounces new event/thread work, schedules completed sessions, and skips the initial baseline", async () => {
    const initial = codex();
    const calls: Array<{ checkpoint: string; scope: CheckpointTriggerScope }> = [];
    const coordinator = createCheckpointTriggerCoordinator({
      debounceMs: 60_000,
      runCheckpoint: async (checkpoint, scope) => {
        calls.push({ checkpoint, scope });
      }
    });

    coordinator.observe(initial);
    expect(calls).toHaveLength(0);

    const updated = structuredClone(initial);
    updated.events.push({
      ...updated.events[0]!,
      id: "follow-up-work-event",
      originType: "codex",
      category: "work_change",
      timestamp: new Date(now + 1_000).toISOString(),
      createdAt: new Date(now + 1_000).toISOString(),
      updatedAt: new Date(now + 1_000).toISOString()
    });
    updated.sessions[0]!.status = "completed";
    coordinator.observe(updated);
    coordinator.observe(updated);
    await coordinator.flush();

    expect(calls).toEqual([
      {
        checkpoint: "event",
        scope: {
          projectId: initial.projects[0]!.id,
          sessionId: initial.sessions[0]!.id,
          threadId: initial.threads[0]!.id
        }
      },
      {
        checkpoint: "thread",
        scope: {
          projectId: initial.projects[0]!.id,
          sessionId: initial.sessions[0]!.id,
          threadId: initial.threads[0]!.id
        }
      },
      {
        checkpoint: "session",
        scope: {
          projectId: initial.projects[0]!.id,
          sessionId: initial.sessions[0]!.id
        }
      }
    ]);

    coordinator.observe(updated);
    await coordinator.flush();
    expect(calls).toHaveLength(3);
    coordinator.dispose();
  });

  it("supports explicit immediate checkpoint triggers and reports runtime errors", async () => {
    const coordinator = createCheckpointTriggerCoordinator({
      runCheckpoint: async (checkpoint) => {
        if (checkpoint === "action") {
          throw new Error("provider unavailable");
        }
      }
    });

    await coordinator.runNow("guidance", { projectId: "project-submind" });
    await expect(
      coordinator.runNow("action", { projectId: "project-submind" })
    ).rejects.toThrow("provider unavailable");
    coordinator.dispose();
  });

  it("refreshes guidance and action checkpoints when matching evidence arrives", async () => {
    const initial = codex();
    const calls: string[] = [];
    const coordinator = createCheckpointTriggerCoordinator({
      debounceMs: 60_000,
      runCheckpoint: async (checkpoint) => {
        calls.push(checkpoint);
      }
    });

    coordinator.observe(initial);
    const updated = structuredClone(initial);
    updated.events.push({
      ...updated.events[0]!,
      id: "action-evidence",
      originType: "codex",
      category: "action",
      timestamp: new Date(now + 1_000).toISOString(),
      createdAt: new Date(now + 1_000).toISOString(),
      updatedAt: new Date(now + 1_000).toISOString()
    });
    coordinator.observe(updated);
    await coordinator.flush();

    expect(calls).toEqual(["event", "thread", "guidance", "action"]);
    coordinator.dispose();
  });

  it("validates persistence writes against retained parents before changing stored work", async () => {
    const db = database();
    try {
      const original = codex();
      await syncRuntimeSnapshotIntoDatabase(db, original);
      const repository = createSqliteRepository({ db });
      const before = await repository.getSnapshot();
      const partial = { ...original, profiles: [], projects: [], sessions: [], threads: [], tasks: [],
        events: [{ ...original.events[0]!, id: "valid-partial-event" }], fileChanges: [] };
      await syncRuntimeSnapshotIntoDatabase(db, partial);
      expect((await repository.getSnapshot()).events.some(e => e.id === "valid-partial-event")).toBe(true);
      partial.events = [{ ...partial.events[0]!, id: "invalid-partial-event", threadId: "missing-thread" }];
      await expect(syncRuntimeSnapshotIntoDatabase(db, partial)).rejects.toThrow("Invalid work scope");
      const after = await repository.getSnapshot();
      expect(after.threads).toEqual(before.threads);
      expect(after.events.some(e => e.id === "invalid-partial-event")).toBe(false);
    } finally { db.raw.close(); }
  });

  it("rejects dangling task evidence even when optional parent IDs are absent", () => {
    const work = codex();
    const event = work.events[0]!;
    event.taskId = "missing-task";
    delete event.threadId;
    delete event.sessionId;
    expect(() => validateObservedAgentWork(work)).toThrow("Invalid task scope");
  });

  it("validates parent scope and accepts a new harness without changing shared identity", () => {
    const work = codex();
    const neutral = annotateAgentWork(work, "future-harness");
    expect(neutral.projects).toEqual(work.projects);
    expect(neutral.events[0]?.metadata.harnessId).toBe("future-harness");
    work.threads[0]!.projectId = "other-project";
    expect(() => validateObservedAgentWork(work)).toThrow("Invalid thread scope");
  });

  it("coalesces concurrent refreshes without repeating successful persistence", async () => {
    let release!: (snapshot: ReturnType<typeof codex>) => void;
    let reads = 0;
    let writes = 0;
    const pending = new Promise<ReturnType<typeof codex>>(resolve => { release = resolve; });
    const refresh = createObservationRefresh([{ harnessId: "codex", observe: () => { reads++; return pending; } }], async () => { writes++; });
    const first = refresh();
    const second = refresh();
    release(codex());
    await Promise.all([first, second]);
    await refresh();
    expect(reads).toBe(1);
    expect(writes).toBe(1);
  });

  it("isolates observation failures and does not infer execution or context push", async () => {
    const result = await collectAgentObservations([
      { harnessId: "unavailable", observe: async () => { throw new Error("offline"); } },
      createAgentObservationSource(codexAdapter, async () => ({ profileName: "Operator", threads: [], events: [], fileChanges: [] })),
      { harnessId: "hermes", observe: async () => hermes() }
    ]);
    expect(result.failures).toEqual([{ harnessId: "unavailable", reason: "Error: offline" }]);
    expect(result.snapshot.threads).toHaveLength(1);
    expect(hermesAdapter.capabilities.execution.actions).toBe(false);
    expect(hermesAdapter.capabilities.contextDelivery).toEqual([]);
    expect(createWorkTraceEnvelope(result.snapshot, result.snapshot.sessions[0]!.id, result.snapshot.threads[0]!.id).harnessIds).toEqual(["hermes"]);
  });

  it("retains evidence across separate refreshes, supplies it to a later harness, and records only observed outcomes", async () => {
    const db = database();
    try {
      const repository = createSqliteRepository({ db });
      const first = codex();
      await syncRuntimeSnapshotIntoDatabase(db, first);
      const initial = await repository.getSnapshot();
      const retained = initial.memory.find(m => m.threadId === first.threads[0]!.id)!;
      await repository.updateMemoryItem({ memoryId: retained.id, summary: "Inventory authority",
        content: "Inventory state belongs in the shared store; UI reads it.", status: "active",
        isPinned: true, curationState: "confirmed" });
      await db.execute("DELETE FROM app_state WHERE key = $1", ["runtime_source"]);
      const later = hermes();
      await syncRuntimeSnapshotIntoDatabase(db, later);
      const snapshot = await repository.getSnapshot();
      expect(snapshot.projects).toHaveLength(1);
      expect(snapshot.threads).toHaveLength(2);
      expect(snapshot.events.some(e => e.id === first.events[0]!.id)).toBe(true);
      const bundle = await createContextBundle(snapshot, { projectId: later.projects[0]!.id,
        threadId: later.threads[0]!.id, prompt: "inventory authority shared store", kinds: ["memory"],
        consumerHarnessId: "hermes", transport: "mcp", maxTokens: 1500 }, { now: () => new Date(now + 1000).toISOString() });
      expect(bundle.items.some(item => item.sources.some(source => source.entityId === retained.id))).toBe(true);
      expect(bundle.delivery).toMatchObject({ state: "response_prepared", consumption: "unverified", attribution: "self_reported" });
      const audit = createContextSupplyAuditEvent(bundle);
      await syncRuntimeSnapshotIntoDatabase(db, { ...later, events: [...later.events, audit] });
      const evidence = { ...later.events[0]!, id: "later-response", timestamp: new Date(now + 2000).toISOString(), summary: "Inventory UI now reads the shared store." };
      await syncRuntimeSnapshotIntoDatabase(db, { ...later, events: [evidence] });
      const final = await repository.getSnapshot();
      const outcome = final.events.find(e => e.eventType === "context_outcome_observed")!;
      expect(outcome.metadata.evidenceEventIds).toEqual(["later-response"]);
      expect(outcome.metadata.assessment).toBe("temporal_correlation_only");
      expect(final.memory.find(m => m.id === retained.id)?.content).toBe("Inventory state belongs in the shared store; UI reads it.");
      expect(final.memory.every(m => !m.sourceEventIds.includes(audit.id))).toBe(true);
      expect(final.events.find(e => e.id === audit.id)?.metadata.composedContext).toBe(bundle.composedContext);
      await syncRuntimeSnapshotIntoDatabase(db, later);
      expect((await repository.getSnapshot()).events.filter(e => e.eventType === "context_outcome_observed")).toHaveLength(1);
    } finally { db.raw.close(); }
  });

  it("rejects cross-project targets and keeps even oversized model text within budget", async () => {
    const snapshot = codex();
    await expect(createContextBundle(snapshot, { projectId: snapshot.projects[0]!.id, threadId: "wrong", prompt: "inventory" })).rejects.toThrow("does not belong");
    const bundle = await createContextBundle(snapshot, { projectId: snapshot.projects[0]!.id, prompt: "inventory", maxTokens: 128 }, {
      modelAdapter: { rankAndCompose: async ({ candidates }) => ({ model: "fixture", selections: candidates.map(c => ({ datumId: c.id, relevanceScore: 1, rationale: "relevant" })), composedContext: "unbounded ".repeat(1000) }) }
    });
    expect(bundle.estimatedTokens).toBeLessThanOrEqual(128);
  });
});
