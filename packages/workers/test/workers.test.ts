import { describe, expect, it } from "vitest";

import { createPreviewStoreSnapshot } from "../../store/src/index";
import {
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
