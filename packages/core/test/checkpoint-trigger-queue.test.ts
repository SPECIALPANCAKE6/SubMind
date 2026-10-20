import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createCheckpointTriggerCoordinator } from "../src/index";
import {
  createSqliteCheckpointTriggerQueue,
  type CheckpointTriggerQueueStore,
  type PersistedCheckpointTrigger
} from "../../store/src/index";

function createMemoryQueue(initial: PersistedCheckpointTrigger[] = []) {
  const entries = new Map(initial.map((entry) => [entry.key, entry]));
  const store: CheckpointTriggerQueueStore = {
    async load() {
      return [...entries.values()];
    },
    async put(entry) {
      entries.set(entry.key, entry);
    },
    async remove(key) {
      entries.delete(key);
    }
  };
  return { entries, store };
}

function createSqlDatabase() {
  const raw = new DatabaseSync(":memory:");
  const bind = (values: unknown[] = []) =>
    Object.fromEntries(values.map((value, index) => [String(index + 1), value]));
  return {
    raw,
    async select<T>(sql: string, values?: unknown[]) {
      return raw.prepare(sql).all(bind(values)) as T;
    },
    async execute(sql: string, values?: unknown[]) {
      const result = raw.prepare(sql).run(bind(values));
      return {
        rowsAffected: Number(result.changes),
        lastInsertId: Number(result.lastInsertRowid)
      };
    }
  };
}

describe("durable checkpoint trigger queue", () => {
  it("persists scheduled triggers and removes them once the run settles", async () => {
    const { entries, store } = createMemoryQueue();
    const ran: string[] = [];
    const coordinator = createCheckpointTriggerCoordinator({
      debounceMs: 60_000,
      queue: store,
      async runCheckpoint(checkpoint, scope) {
        await coordinator.settled();
        expect(entries.size).toBe(1);
        ran.push(`${checkpoint}:${scope.threadId}`);
      }
    });

    coordinator.trigger("thread", { projectId: "p1", threadId: "t1" });
    coordinator.trigger("thread", { projectId: "p1", threadId: "t1" });
    await coordinator.settled();
    expect(entries.size).toBe(1);

    await coordinator.flush();
    await coordinator.settled();
    expect(ran).toEqual(["thread:t1"]);
    expect(entries.size).toBe(0);
    coordinator.dispose();
  });

  it("replays unfinished triggers after a restart and drops stale ones", async () => {
    const fresh: PersistedCheckpointTrigger = {
      key: "fresh",
      checkpoint: "session",
      scope: { projectId: "p1", sessionId: "s1" },
      enqueuedAt: new Date(Date.now() - 1_000).toISOString()
    };
    const stale: PersistedCheckpointTrigger = {
      key: "stale",
      checkpoint: "event",
      scope: { projectId: "p1", eventId: "e1" },
      enqueuedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    };
    const { entries, store } = createMemoryQueue([fresh, stale]);
    const ran: string[] = [];
    const coordinator = createCheckpointTriggerCoordinator({
      debounceMs: 60_000,
      queue: store,
      async runCheckpoint(checkpoint, scope) {
        ran.push(`${checkpoint}:${scope.sessionId}`);
      }
    });

    await expect(coordinator.restore()).resolves.toBe(1);
    expect(entries.has("stale")).toBe(false);

    await coordinator.flush();
    await coordinator.settled();
    expect(ran).toEqual(["session:s1"]);
    expect(entries.size).toBe(0);
    coordinator.dispose();
  });

  it("keeps a trigger queued when its run fails to complete before a crash", async () => {
    const { entries, store } = createMemoryQueue();
    const coordinator = createCheckpointTriggerCoordinator({
      debounceMs: 60_000,
      queue: store,
      runCheckpoint: () => new Promise<void>(() => undefined)
    });
    coordinator.trigger("action", { projectId: "p1", actionId: "a1" });
    await coordinator.settled();
    void coordinator.flush();
    await coordinator.settled();
    expect(entries.size).toBe(1);
    coordinator.dispose();
    expect(entries.size).toBe(1);
  });

  it("reports queue write failures without blocking scheduling", async () => {
    const errors: unknown[] = [];
    const ran: string[] = [];
    const coordinator = createCheckpointTriggerCoordinator({
      debounceMs: 60_000,
      queue: {
        async load() {
          return [];
        },
        async put() {
          throw new Error("disk full");
        },
        async remove() {
          throw new Error("disk full");
        }
      },
      onQueueError: (error) => errors.push(error),
      async runCheckpoint(checkpoint) {
        ran.push(checkpoint);
      }
    });
    coordinator.trigger("event", { projectId: "p1", eventId: "e1" });
    await coordinator.flush();
    await coordinator.settled();
    expect(ran).toEqual(["event"]);
    expect(errors).toHaveLength(2);
    coordinator.dispose();
  });

  it("round-trips through the SQLite queue and drops unreadable rows", async () => {
    const db = createSqlDatabase();
    const queue = createSqliteCheckpointTriggerQueue(db);
    const entry: PersistedCheckpointTrigger = {
      key: "k1",
      checkpoint: "guidance",
      scope: { projectId: "p1", threadId: "t1" },
      enqueuedAt: "2026-01-01T00:00:00.000Z"
    };
    await queue.put(entry);
    await queue.put({ ...entry, enqueuedAt: "2026-02-02T00:00:00.000Z" });
    await expect(queue.load()).resolves.toEqual([entry]);

    db.raw
      .prepare(
        "INSERT INTO checkpoint_trigger_queue VALUES ('bad', 'nonsense', '{}', '2026-01-01T00:00:00.000Z')"
      )
      .run();
    await expect(queue.load()).resolves.toEqual([entry]);
    expect(
      db.raw.prepare("SELECT COUNT(*) AS count FROM checkpoint_trigger_queue").get()
    ).toMatchObject({ count: 1 });

    await queue.remove("k1");
    await expect(queue.load()).resolves.toEqual([]);
  });
});
