import { describe, expect, it } from "vitest";

import {
  contextDatumKinds,
  contextSourceEntityKinds,
  coreEntityKinds,
  eventOrigins,
  eventNodeCategories,
  eventTaxonomy,
  projectStackInteractionRules,
  projectStackTransitions
} from "../src/index";

describe("shared schemas", () => {
  it("keeps the core entity set aligned with AGENTS.md", () => {
    expect(coreEntityKinds).toEqual([
      "Profile",
      "Project",
      "Session",
      "Thread",
      "Task",
      "Event",
      "FileChange",
      "MemoryItem",
      "GuidanceItem",
      "ActionItem"
    ]);
  });

  it("keeps the locked event taxonomy intact", () => {
    expect(eventTaxonomy).toEqual([
      "lifecycle",
      "work_change",
      "guidance",
      "memory",
      "action",
      "subagent",
      "system_user"
    ]);

    expect(eventOrigins).toEqual([
      "codex",
      "submind",
      "subagent",
      "system",
      "user"
    ]);

    expect(eventNodeCategories).toEqual([
      "anchor",
      "change",
      "cognitive",
      "control",
      "delegation",
      "marker"
    ]);
  });

  it("preserves the project stack interaction model", () => {
    expect(projectStackInteractionRules).toEqual({
      select: "single_click",
      focus: "explicit_action_or_double_click"
    });
    expect(projectStackTransitions.focused).toEqual(["selected"]);
  });

  it("defines the context bundle source vocabulary", () => {
    expect(contextDatumKinds).toEqual([
      "project_context",
      "memory",
      "guidance",
      "recent_change",
      "pending_action"
    ]);
    expect(contextSourceEntityKinds).toEqual([
      "Project",
      "MemoryItem",
      "GuidanceItem",
      "Event",
      "FileChange",
      "ActionItem"
    ]);
  });
});
