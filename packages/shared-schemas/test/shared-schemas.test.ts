import { describe, expect, it } from "vitest";

import {
  coreEntityKinds,
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
  });

  it("preserves the project stack interaction model", () => {
    expect(projectStackInteractionRules).toEqual({
      select: "single_click",
      focus: "explicit_action"
    });
    expect(projectStackTransitions.focused).toEqual(["selected"]);
  });
});

