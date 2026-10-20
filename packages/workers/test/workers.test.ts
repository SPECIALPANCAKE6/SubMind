import { describe, expect, it } from "vitest";

import { createPreviewStoreSnapshot } from "../../store/src/index";
import {
  createContextBundle,
  createContextCandidates,
  createContextInjectionAuditEvent,
  createActionCheckpointSummary,
  createCheckpointRunAuditEvent,
  createGeneratedCheckpointProposals,
  createGuidanceCheckpointSummary,
  createNativeModelWorkerAdapter,
  executeCheckpointModelWorkers,
  createWorkerPlan,
  supportedCheckpoints
} from "../src/index";

describe("worker planning", () => {
  it("supports the checkpoint phases defined in AGENTS.md", () => {
    expect(supportedCheckpoints).toEqual([
      "event",
      "thread",
      "session",
      "guidance",
      "action"
    ]);
  });

  describe("operator-controlled context eligibility", () => {
    it("keeps unapproved proposal tasks and candidate guidance out of bundles", () => {
      const snapshot = createPreviewStoreSnapshot();
      const task = snapshot.tasks[0]!;
      const guidance = snapshot.guidance[0]!;
      task.contextEligible = false;
      guidance.state = "candidate";
      guidance.contextEligible = false;

      const taskRequest = {
        projectId: task.projectId,
        prompt: task.title,
        kinds: ["task" as const]
      };
      const guidanceRequest = {
        projectId: guidance.projectId,
        prompt: guidance.title,
        kinds: ["guidance" as const]
      };
      expect(createContextCandidates(snapshot, taskRequest)).toEqual([]);
      expect(createContextCandidates(snapshot, guidanceRequest)).toEqual([]);

      task.contextEligible = true;
      guidance.state = "suggested";
      guidance.contextEligible = true;
      expect(
        createContextCandidates(snapshot, taskRequest).map((item) => item.id)
      ).toContain(`context-task-${task.id}`);
      expect(
        createContextCandidates(snapshot, guidanceRequest).map((item) => item.id)
      ).toContain(`context-guidance-${guidance.id}`);
    });
  });

  it("keeps deterministic and model workers separated", () => {
    const plan = createWorkerPlan("event");

    expect(plan.deterministic).toContain("policy enforcement");
    expect(plan.model).toEqual(["extraction"]);
  });

  it("executes checkpoint model workers in plan order with scoped, redacted context", async () => {
    const snapshot = createPreviewStoreSnapshot();
    const project = snapshot.projects.find((item) => item.id === "project-submind")!;
    project.summary = "Operator token=sm_abcdefghijklmnopqrstuvwxyz0123456789";
    const session = snapshot.sessions.find((item) => item.projectId === project.id)!;
    const calls: string[] = [];
    const run = await executeCheckpointModelWorkers(snapshot, {
      checkpoint: "session",
      scope: { sessionId: session.id },
      now: () => "2026-07-03T15:00:00.000Z",
      adapter: {
        execute: async (input) => {
          calls.push(input.worker);
          expect(input.checkpoint).toBe("session");
          expect(input.context.project.summary).not.toContain("sm_abcdefghijklmnopqrstuvwxyz");
          expect(input.context.sessions.map((item) => item.id)).toEqual([session.id]);
          expect(input.context).not.toHaveProperty("profiles");
          return {
            model: "test-model",
            output: {
              worker: input.worker,
              previous: Object.keys(input.priorResults)
            }
          };
        }
      }
    });

    expect(calls).toEqual([
      "summarization",
      "extraction",
      "task_synthesis",
      "ranking",
      "composition"
    ]);
    expect(run).toMatchObject({
      checkpoint: "session",
      status: "completed",
      startedAt: "2026-07-03T15:00:00.000Z",
      completedAt: "2026-07-03T15:00:00.000Z"
    });
    expect(run.executions[4]?.output?.previous).toEqual([
      "summarization",
      "extraction",
      "task_synthesis",
      "ranking"
    ]);
    const auditEvent = createCheckpointRunAuditEvent(run);
    expect(auditEvent).toMatchObject({
      projectId: "project-submind",
      eventType: "model-checkpoint-run",
      category: "system_user",
      nodeCategory: "marker"
    });
    expect(auditEvent.metadata.executions).toEqual(run.executions);
  });

  it("executes every worker declared by each supported checkpoint plan", async () => {
    const snapshot = createPreviewStoreSnapshot();

    for (const checkpoint of supportedCheckpoints) {
      const calls: string[] = [];
      const run = await executeCheckpointModelWorkers(snapshot, {
        checkpoint,
        scope: { projectId: "project-submind" },
        adapter: {
          execute: async ({ worker }) => {
            calls.push(worker);
            return { model: "test-model", output: {} };
          }
        }
      });

      expect(calls).toEqual(createWorkerPlan(checkpoint).model);
      expect(run.executions.map((execution) => execution.worker)).toEqual(
        createWorkerPlan(checkpoint).model
      );
    }
  });

  it("forwards model-worker calls to the native Tauri command without exposing credentials", async () => {
    const invokeCalls: Array<{ command: string; payload: Record<string, unknown> }> = [];
    const adapter = createNativeModelWorkerAdapter(async <T>(
      command: string,
      payload: Record<string, unknown>
    ) => {
      invokeCalls.push({ command, payload });
      return {
        model: "native-context-model",
        output: { summary: "bounded output" }
      } as T;
    });
    const input = {
      checkpoint: "event" as const,
      worker: "extraction" as const,
      scope: { projectId: "project-submind" },
      context: {
        project: createPreviewStoreSnapshot().projects[0]!,
        sessions: [],
        threads: [],
        tasks: [],
        events: [],
        fileChanges: [],
        memory: [],
        guidance: [],
        actions: []
      },
      priorResults: {}
    };

    await expect(adapter.execute(input)).resolves.toEqual({
      model: "native-context-model",
      output: { summary: "bounded output" }
    });
    expect(invokeCalls).toEqual([
      {
        command: "execute_model_worker",
        payload: {
          checkpoint: "event",
          worker: "extraction",
          scope: input.scope,
          context: input.context,
          priorResults: {}
        }
      }
    ]);
  });

  it("reports individual worker failures and continues the checkpoint", async () => {
    const snapshot = createPreviewStoreSnapshot();
    let calls = 0;
    const run = await executeCheckpointModelWorkers(snapshot, {
      checkpoint: "thread",
      scope: { projectId: "project-submind" },
      adapter: {
        execute: async ({ worker }) => {
          calls += 1;
          if (worker === "summarization") {
            throw new Error("provider failed");
          }
          return { model: "test-model", output: { links: [] } };
        }
      }
    });

    expect(calls).toBe(4);
    expect(run.status).toBe("partial");
    expect(run.executions).toEqual([
      {
        worker: "summarization",
        status: "failed",
        error: "Error: provider failed"
      },
      {
        worker: "extraction",
        status: "completed",
        model: "test-model",
        output: { links: [] }
      },
      {
        worker: "task_synthesis",
        status: "completed",
        model: "test-model",
        output: { links: [] }
      },
      {
        worker: "linking",
        status: "completed",
        model: "test-model",
        output: { links: [] }
      }
    ]);
  });

  it("turns extracted evidence into reviewable draft memories and guidance candidates", async () => {
    const snapshot = createPreviewStoreSnapshot();
    const thread = snapshot.threads.find(
      (item) => item.id === "thread-submind-migration"
    )!;
    const sourceEvent = snapshot.events.find(
      (item) => item.threadId === thread.id
    )!;
    const extractionRun = await executeCheckpointModelWorkers(snapshot, {
      checkpoint: "thread",
      scope: { threadId: thread.id },
      now: () => "2026-07-03T15:00:00.000Z",
      adapter: {
        execute: async ({ worker }) => ({
          model: "test-model",
          output:
            worker === "extraction"
              ? {
                  memories: [
                    {
                      bucket: "architecture_notes",
                      summary: "Store is the persistence authority",
                      content: "UI state is read from the shared store.",
                      confidence: 0.91,
                      sourceEventIds: [sourceEvent.id],
                      sourceFileChangeIds: []
                    }
                  ]
                }
              : worker === "task_synthesis"
                ? {
                    tasks: [
                      {
                        title: "Extract the inventory ownership task",
                        summary: "Move inventory reads to the shared store.",
                        status: "active",
                        priority: "high",
                        sourceEventIds: [sourceEvent.id]
                      }
                    ]
                  }
                : {}
        })
      }
    });
    const memoryProposals = createGeneratedCheckpointProposals(
      snapshot,
      extractionRun
    );

    expect(memoryProposals.memory).toHaveLength(1);
    expect(memoryProposals.memory[0]).toMatchObject({
      status: "draft",
      curationState: "derived",
      bucket: "architecture_notes",
      sourceEventIds: [sourceEvent.id],
      isPinned: false
    });
    expect(memoryProposals.tasks).toHaveLength(1);
    expect(memoryProposals.tasks[0]).toMatchObject({
      status: "proposed",
      suggestedStatus: "active",
      source: "model",
      threadId: thread.id,
      sourceEventIds: [sourceEvent.id]
    });
    expect(memoryProposals.rejected).toEqual([]);

    const guidanceRun = await executeCheckpointModelWorkers(snapshot, {
      checkpoint: "guidance",
      scope: { threadId: thread.id },
      now: () => "2026-07-03T15:01:00.000Z",
      adapter: {
        execute: async ({ worker }) => ({
          model: "test-model",
          output:
            worker === "composition"
              ? {
                  guidance: [
                    {
                      title: "Keep inventory ownership explicit",
                      summary: "Read inventory from the shared store.",
                      rationale: "This avoids competing sources of truth.",
                      confidence: 0.86,
                      evidenceSummary: "Supported by the current project event.",
                      policySummary: "Review before injecting into an agent context.",
                      linkedMemoryItemIds: [],
                      linkedEventIds: [sourceEvent.id],
                      linkedActionItemIds: []
                    }
                  ]
                }
              : worker === "task_synthesis"
                ? { tasks: [] }
                : {}
        })
      }
    });
    const guidanceProposals = createGeneratedCheckpointProposals(
      snapshot,
      guidanceRun
    );

    expect(guidanceProposals.guidance).toHaveLength(1);
    expect(guidanceProposals.guidance[0]).toMatchObject({
      state: "candidate",
      source: "model",
      linkedEventIds: [sourceEvent.id]
    });
    expect(guidanceProposals.rejected).toEqual([]);
  });

  it("rejects model proposals with unscoped evidence or invalid confidence", async () => {
    const snapshot = createPreviewStoreSnapshot();
    const run = await executeCheckpointModelWorkers(snapshot, {
      checkpoint: "thread",
      scope: { threadId: "thread-submind-migration" },
      adapter: {
        execute: async ({ worker }) => ({
          model: "test-model",
          output:
            worker === "extraction"
              ? {
                  memories: [
                    {
                      bucket: "architecture_notes",
                      summary: "Unsupported memory",
                      content: "No evidence.",
                      confidence: 2,
                      sourceEventIds: ["event-from-another-project"],
                      sourceFileChangeIds: []
                    }
                  ]
                }
              : {}
        })
      }
    });

    const proposals = createGeneratedCheckpointProposals(snapshot, run);
    expect(proposals.memory).toHaveLength(0);
    expect(proposals.rejected.some((item) => item.kind === "memory")).toBe(true);
  });

  it("rejects a checkpoint scope that combines different projects", async () => {
    const snapshot = createPreviewStoreSnapshot();
    const otherProjectId = snapshot.projects.find(
      (item) => item.id !== "project-submind"
    )?.id;
    if (!otherProjectId) {
      snapshot.projects.push({
        ...snapshot.projects[0]!,
        id: "project-other"
      });
      snapshot.sessions.push({
        ...snapshot.sessions[0]!,
        id: "session-other",
        projectId: "project-other"
      });
    }
    const otherSession = snapshot.sessions.find(
      (item) => item.projectId !== "project-submind"
    )!;

    await expect(
      executeCheckpointModelWorkers(snapshot, {
        checkpoint: "event",
        scope: { projectId: "project-submind", sessionId: otherSession.id },
        adapter: {
          execute: async () => ({ model: "test-model", output: {} })
        }
      })
    ).rejects.toThrow("different projects");
  });

  it("builds a deterministic guidance checkpoint summary from the active scope", () => {
    const snapshot = createPreviewStoreSnapshot();
    const summary = createGuidanceCheckpointSummary(snapshot, "project-submind");

    expect(summary.guidanceCount).toBe(1);
    expect(summary.injectedCount).toBe(1);
    expect(summary.linkedMemoryCount).toBe(2);
    expect(summary.highRiskActionCount).toBe(1);
    expect(summary.dominantSource).toBe("policy");
    expect(summary.recommendedTitle).toContain("injected");
  });

  it("builds a deterministic action checkpoint summary from the active scope", () => {
    const snapshot = createPreviewStoreSnapshot();
    const summary = createActionCheckpointSummary(snapshot, "project-submind");

    expect(summary.actionCount).toBe(1);
    expect(summary.openCount).toBe(1);
    expect(summary.pendingCount).toBe(1);
    expect(summary.highRiskCount).toBe(1);
    expect(summary.operatorOwnedCount).toBe(1);
    expect(summary.relatedGuidanceCount).toBe(1);
    expect(summary.relatedFileChangeCount).toBe(2);
    expect(summary.recommendedTitle).toContain("open");
  });
});

describe("context bundle pipeline", () => {
  it("filters ineligible records and keeps thread-relevant candidates first", () => {
    const snapshot = createPreviewStoreSnapshot();
    snapshot.memory.push({
      ...snapshot.memory[0],
      id: "memory-archived-test",
      projectId: "project-submind",
      status: "archived",
      summary: "Archived secret",
      content: "This must not be supplied."
    });
    snapshot.guidance.push({
      ...snapshot.guidance[0],
      id: "guidance-suppressed-test",
      state: "suppressed",
      title: "Suppressed guidance"
    });
    snapshot.actions.push({
      ...snapshot.actions[0],
      id: "action-resolved-test",
      state: "resolved",
      title: "Resolved action"
    });

    const candidates = createContextCandidates(snapshot, {
      projectId: "project-submind",
      threadId: "thread-submind-migration",
      prompt: "What context matters for the SubMind shell?",
      maxItems: 3,
      maxTokens: 500
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some((item) => item.id.includes("archived-test"))).toBe(false);
    expect(candidates.some((item) => item.id.includes("suppressed-test"))).toBe(false);
    expect(candidates.some((item) => item.id.includes("resolved-test"))).toBe(false);
    expect(candidates[0]?.projectId).toBe("project-submind");
  });

  it("uses a configured model adapter for relevance and composition", async () => {
    const snapshot = createPreviewStoreSnapshot();
    const bundle = await createContextBundle(
      snapshot,
      {
        projectId: "project-submind",
        prompt: "What should Codex know before changing guidance?",
        maxItems: 2
      },
      {
        now: () => "2026-07-03T15:00:00.000Z",
        modelAdapter: {
          rankAndCompose: async ({ candidates }) => ({
            model: "test-context-ranker",
            selections: candidates
              .slice(-2)
              .reverse()
              .map((item, index) => ({
                datumId: item.id,
                relevanceScore: 0.95 - index * 0.05,
                rationale: "Directly relevant to the requested guidance change."
              })),
            composedContext: "Model-composed, redacted project context."
          })
        }
      }
    );

    expect(bundle.ranking).toMatchObject({
      mode: "model",
      model: "test-context-ranker"
    });
    expect(bundle.composedContext).toBe("Model-composed, redacted project context.");
    expect(bundle.items).toHaveLength(2);
    expect(bundle.prompt).not.toHaveProperty("raw");
    expect(bundle.prompt.summary).toBe("Context request for SubMind (48 characters).");
    expect(bundle.prompt.summary).not.toContain("Codex");
  });

  it("reports deterministic fallback when the model adapter fails", async () => {
    const bundle = await createContextBundle(
      createPreviewStoreSnapshot(),
      {
        projectId: "project-submind",
        prompt: "Summarize current project context."
      },
      {
        modelAdapter: {
          rankAndCompose: async () => {
            throw new Error("provider unavailable");
          }
        }
      }
    );

    expect(bundle.ranking.mode).toBe("deterministic_fallback");
    expect(bundle.ranking.reason).toContain("failed");
    expect(bundle.composedContext).toContain("sources:");
  });

  it("creates an audit event containing the exact supplied data and sources", async () => {
    const bundle = await createContextBundle(
      createPreviewStoreSnapshot(),
      {
        projectId: "project-submind",
        threadId: "thread-submind-migration",
        prompt: "Show the relevant shell context.",
        maxItems: 2
      },
      { now: () => "2026-07-03T15:00:00.000Z" }
    );
    const event = createContextInjectionAuditEvent(bundle);

    expect(event.projectId).toBe("project-submind");
    expect(event.threadId).toBe("thread-submind-migration");
    expect(event.eventType).toBe("context_bundle_supplied");
    expect(event.metadata.suppliedItems).toEqual(bundle.items);
    expect(event.metadata.composedContext).toBe(bundle.composedContext);
    expect(event.metadata.sources).toEqual(bundle.items.flatMap((item) => item.sources));
  });
});
