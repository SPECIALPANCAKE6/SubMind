import type { CheckpointKind, Event } from "@submind/shared-schemas";
import type {
  CheckpointTriggerQueueStore,
  SubMindStoreSnapshot
} from "@submind/store";

export interface CheckpointTriggerScope {
  projectId?: string;
  sessionId?: string;
  threadId?: string;
  eventId?: string;
  actionId?: string;
}

export interface CheckpointTriggerCoordinatorOptions {
  debounceMs?: number;
  maxDebounceMs?: number;
  /**
   * Optional durable queue. Triggers are persisted when scheduled and removed
   * once their run settles, so a restart replays work that never finished
   * (at-least-once). A run that fails is reported via `onError` and dropped.
   */
  queue?: CheckpointTriggerQueueStore;
  /** Persisted triggers older than this are discarded on restore. Default 24h. */
  maxQueuedAgeMs?: number;
  now?: () => number;
  runCheckpoint(
    checkpoint: CheckpointKind,
    scope: CheckpointTriggerScope
  ): Promise<void>;
  onError?(
    error: unknown,
    checkpoint: CheckpointKind,
    scope: CheckpointTriggerScope
  ): void;
  onQueueError?(error: unknown): void;
}

interface PendingCheckpoint {
  key: string;
  checkpoint: CheckpointKind;
  scope: CheckpointTriggerScope;
  enqueuedAt: string;
}

function createTriggerKey(
  checkpoint: CheckpointKind,
  scope: CheckpointTriggerScope
): string {
  return JSON.stringify([
    checkpoint,
    scope.projectId ?? "",
    scope.sessionId ?? "",
    scope.threadId ?? "",
    scope.eventId ?? "",
    scope.actionId ?? ""
  ]);
}

function eventCanTriggerCheckpoint(event: Event): boolean {
  return (
    ["agent", "codex", "subagent"].includes(event.originType) &&
    ["lifecycle", "work_change", "memory", "guidance", "action"].includes(
      event.category
    )
  );
}

export function createCheckpointTriggerCoordinator(
  options: CheckpointTriggerCoordinatorOptions
) {
  const debounceMs = Math.max(0, options.debounceMs ?? 5_000);
  const maxDebounceMs = Math.max(debounceMs, options.maxDebounceMs ?? 30_000);
  const pending = new Map<string, PendingCheckpoint>();
  let previousSnapshot: SubMindStoreSnapshot | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstPendingAt: number | undefined;
  let running: Promise<void> | undefined;
  let disposed = false;
  let persistence: Promise<void> = Promise.resolve();
  const now = options.now ?? Date.now;
  const maxQueuedAgeMs = Math.max(0, options.maxQueuedAgeMs ?? 24 * 60 * 60 * 1000);

  // Queue writes are serialized so put/remove for the same key keep their order.
  function persist(operation: (queue: CheckpointTriggerQueueStore) => Promise<void>) {
    const queue = options.queue;
    if (!queue) {
      return;
    }
    persistence = persistence.then(async () => {
      try {
        await operation(queue);
      } catch (error) {
        options.onQueueError?.(error);
      }
    });
  }

  function arm() {
    if (firstPendingAt === undefined) {
      firstPendingAt = Date.now();
    }
    if (timer) {
      clearTimeout(timer);
    }
    const remainingMaxWait = Math.max(
      0,
      maxDebounceMs - (Date.now() - firstPendingAt)
    );
    timer = setTimeout(() => {
      void flush();
    }, Math.min(debounceMs, remainingMaxWait));
  }

  function schedule(checkpoint: CheckpointKind, scope: CheckpointTriggerScope) {
    if (disposed) {
      throw new Error("Checkpoint trigger coordinator has been disposed.");
    }
    const normalizedScope = { ...scope };
    const key = createTriggerKey(checkpoint, normalizedScope);
    const entry: PendingCheckpoint = {
      key,
      checkpoint,
      scope: normalizedScope,
      enqueuedAt: pending.get(key)?.enqueuedAt ?? new Date(now()).toISOString()
    };
    pending.set(key, entry);
    persist((queue) => queue.put(entry));
    arm();
  }

  /** Replays triggers persisted by a previous run; stale or invalid ones are dropped. */
  async function restore(): Promise<number> {
    const queue = options.queue;
    if (!queue || disposed) {
      return 0;
    }
    await persistence;
    const entries = await queue.load();
    let restored = 0;
    for (const entry of entries) {
      const age = now() - Date.parse(entry.enqueuedAt);
      if (!Number.isFinite(age) || age > maxQueuedAgeMs) {
        persist((target) => target.remove(entry.key));
        continue;
      }
      if (!pending.has(entry.key)) {
        pending.set(entry.key, {
          key: entry.key,
          checkpoint: entry.checkpoint,
          scope: { ...entry.scope },
          enqueuedAt: entry.enqueuedAt
        });
        restored += 1;
      }
    }
    if (pending.size > 0) {
      arm();
    }
    await persistence;
    return restored;
  }

  async function runCheckpoint(
    checkpoint: CheckpointKind,
    scope: CheckpointTriggerScope
  ): Promise<void> {
    try {
      await options.runCheckpoint(checkpoint, scope);
    } catch (error) {
      if (!options.onError) {
        throw error;
      }
      options.onError(error, checkpoint, scope);
    }
  }

  async function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (running) {
      await running;
    }
    const work = [...pending.values()];
    pending.clear();
    firstPendingAt = undefined;
    if (work.length === 0) {
      return;
    }

    running = (async () => {
      for (const item of work) {
        try {
          await runCheckpoint(item.checkpoint, item.scope);
        } finally {
          // A trigger rescheduled during its own run stays queued.
          if (!pending.has(item.key)) {
            persist((queue) => queue.remove(item.key));
          }
        }
      }
    })();
    try {
      await running;
    } finally {
      running = undefined;
      if (pending.size > 0 && !disposed) {
        scheduleNextFlush();
      }
    }
  }

  function scheduleNextFlush() {
    if (timer || pending.size === 0) {
      return;
    }
    firstPendingAt = Date.now();
    timer = setTimeout(() => {
      void flush();
    }, debounceMs);
  }

  function observe(snapshot: SubMindStoreSnapshot): void {
    if (disposed) {
      throw new Error("Checkpoint trigger coordinator has been disposed.");
    }
    if (!previousSnapshot) {
      previousSnapshot = structuredClone(snapshot);
      return;
    }

    const previousEventIds = new Set(
      previousSnapshot.events.map((event) => event.id)
    );
    const newEvents = snapshot.events.filter(
      (event) => !previousEventIds.has(event.id) && eventCanTriggerCheckpoint(event)
    );
    const eventScopes = new Map<
      string,
      { scope: CheckpointTriggerScope; categories: Set<Event["category"]> }
    >();

    for (const event of newEvents) {
      const scope: CheckpointTriggerScope = {
        projectId: event.projectId,
        ...(event.sessionId ? { sessionId: event.sessionId } : {}),
        ...(event.threadId ? { threadId: event.threadId } : {}),
        ...(!event.sessionId && !event.threadId ? { eventId: event.id } : {})
      };
      const groupingKey = JSON.stringify([
        scope.projectId,
        scope.sessionId ?? "",
        scope.threadId ?? "",
        scope.eventId ?? ""
      ]);
      const grouped = eventScopes.get(groupingKey) ?? {
        scope,
        categories: new Set<Event["category"]>()
      };
      grouped.categories.add(event.category);
      eventScopes.set(groupingKey, grouped);
    }

    for (const { scope, categories } of eventScopes.values()) {
      schedule("event", scope);
      if (scope.threadId) {
        schedule("thread", scope);
      }
      if (
        categories.has("guidance") ||
        categories.has("memory") ||
        categories.has("action")
      ) {
        schedule("guidance", scope);
      }
      if (categories.has("action")) {
        schedule("action", scope);
      }
    }

    const previousSessions = new Map(
      previousSnapshot.sessions.map((session) => [session.id, session])
    );
    for (const session of snapshot.sessions) {
      const previousSession = previousSessions.get(session.id);
      if (
        previousSession?.status === "active" &&
        ["idle", "completed"].includes(session.status)
      ) {
        schedule("session", {
          projectId: session.projectId,
          sessionId: session.id
        });
      }
    }

    previousSnapshot = structuredClone(snapshot);
  }

  return {
    observe,
    trigger: schedule,
    restore,
    /** Resolves when all queued durable-queue writes have settled. */
    settled: () => persistence,
    runNow: options.runCheckpoint,
    flush,
    dispose() {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      pending.clear();
      firstPendingAt = undefined;
    }
  };
}
