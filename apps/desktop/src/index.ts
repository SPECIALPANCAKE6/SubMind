import { describeRuntimeContext } from "@submind/core";
import { starterSubagents } from "@submind/policy";
import { createEmptyCodexProtocolEnvelope } from "@submind/protocol-codex";
import type { Project } from "@submind/shared-schemas";
import { createEmptyStoreSnapshot } from "@submind/store";
import {
  focusViewPanels,
  operatorViewPanels,
  tabViewPanels
} from "@submind/ui-components";
import { shellViews } from "@submind/ui-state";
import { createWorkerPlan } from "@submind/workers";

export const desktopShellManifest = {
  name: "SubMind Desktop",
  views: shellViews,
  panels: {
    operator: operatorViewPanels,
    focus: focusViewPanels,
    tab: tabViewPanels
  }
} as const;

export function createDesktopBootstrap(project: Project) {
  return {
    shell: desktopShellManifest,
    runtime: describeRuntimeContext({ project }),
    store: createEmptyStoreSnapshot(),
    protocol: createEmptyCodexProtocolEnvelope(
      "pending-session",
      "pending-thread",
      project.updatedAt
    ),
    checkpoints: {
      event: createWorkerPlan("event"),
      thread: createWorkerPlan("thread"),
      session: createWorkerPlan("session"),
      guidance: createWorkerPlan("guidance"),
      action: createWorkerPlan("action")
    },
    availableSubagents: starterSubagents
  };
}
