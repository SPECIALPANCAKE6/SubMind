import { describe, expect, it } from "vitest";

import { createPreviewStoreSnapshot } from "../../store/src/index";
import {
  createContextBundle,
  createContextCandidates,
  createContextInjectionAuditEvent,
  createActionCheckpointSummary,
  createGuidanceCheckpointSummary,
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

  it("keeps deterministic and model workers separated", () => {
    const plan = createWorkerPlan("event");

    expect(plan.deterministic).toContain("policy enforcement");
    expect(plan.model).toEqual(["extraction"]);
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
