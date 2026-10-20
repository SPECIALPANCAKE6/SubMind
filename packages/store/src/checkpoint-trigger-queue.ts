import { checkpointKinds, type CheckpointKind } from "@submind/shared-schemas";
import type { SubMindSqlDatabase } from "./sqlite-repository.js";

export interface PersistedCheckpointTriggerScope {
  projectId?: string;
  sessionId?: string;
  threadId?: string;
  eventId?: string;
  actionId?: string;
}

export interface PersistedCheckpointTrigger {
  key: string;
  checkpoint: CheckpointKind;
  scope: PersistedCheckpointTriggerScope;
  enqueuedAt: string;
}

export interface CheckpointTriggerQueueStore {
  load(): Promise<PersistedCheckpointTrigger[]>;
  put(entry: PersistedCheckpointTrigger): Promise<void>;
  remove(key: string): Promise<void>;
}

interface QueueRow {
  trigger_key: string;
  checkpoint: string;
  scope_json: string;
  enqueued_at: string;
}

const scopeFields = ["projectId", "sessionId", "threadId", "eventId", "actionId"] as const;

function parseScope(value: string): PersistedCheckpointTriggerScope | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const scope: PersistedCheckpointTriggerScope = {};
    for (const field of scopeFields) {
      const fieldValue = (parsed as Record<string, unknown>)[field];
      if (typeof fieldValue === "string" && fieldValue) {
        scope[field] = fieldValue;
      }
    }
    return scope;
  } catch {
    return null;
  }
}

/** Durable pending-trigger queue backed by the app SQLite database. */
export function createSqliteCheckpointTriggerQueue(
  db: SubMindSqlDatabase
): CheckpointTriggerQueueStore {
  let ready: Promise<void> | undefined;

  function ensureTable(): Promise<void> {
    ready ??= db
      .execute(
        `CREATE TABLE IF NOT EXISTS checkpoint_trigger_queue (
          trigger_key TEXT PRIMARY KEY NOT NULL,
          checkpoint TEXT NOT NULL,
          scope_json TEXT NOT NULL,
          enqueued_at TEXT NOT NULL
        )`
      )
      .then(() => undefined);
    ready.catch(() => {
      ready = undefined;
    });
    return ready;
  }

  return {
    async load() {
      await ensureTable();
      const rows = await db.select<QueueRow[]>(
        "SELECT trigger_key, checkpoint, scope_json, enqueued_at FROM checkpoint_trigger_queue ORDER BY enqueued_at ASC"
      );
      const entries: PersistedCheckpointTrigger[] = [];
      for (const row of rows) {
        const scope = parseScope(row.scope_json);
        if (
          !scope ||
          !(checkpointKinds as readonly string[]).includes(row.checkpoint)
        ) {
          // Unreadable rows can never run; drop them rather than replaying forever.
          await db.execute("DELETE FROM checkpoint_trigger_queue WHERE trigger_key = $1", [
            row.trigger_key
          ]);
          continue;
        }
        entries.push({
          key: row.trigger_key,
          checkpoint: row.checkpoint as CheckpointKind,
          scope,
          enqueuedAt: row.enqueued_at
        });
      }
      return entries;
    },
    async put(entry) {
      await ensureTable();
      await db.execute(
        `INSERT INTO checkpoint_trigger_queue (trigger_key, checkpoint, scope_json, enqueued_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT(trigger_key) DO UPDATE SET
           checkpoint = excluded.checkpoint,
           scope_json = excluded.scope_json`,
        [entry.key, entry.checkpoint, JSON.stringify(entry.scope), entry.enqueuedAt]
      );
    },
    async remove(key) {
      await ensureTable();
      await db.execute("DELETE FROM checkpoint_trigger_queue WHERE trigger_key = $1", [key]);
    }
  };
}
