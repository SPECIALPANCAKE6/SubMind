import { describe, expect, it } from "vitest";

import {
  clearProjectFocus,
  createProjectStackSelection,
  focusProject,
  selectProject
} from "../src/index";

describe("ui-state", () => {
  it("starts unselected and can be selected explicitly", () => {
    const selection = createProjectStackSelection("project-1");
    const selected = selectProject(selection);

    expect(selection.state).toBe("unselected");
    expect(selected.state).toBe("selected");
  });

  it("returns focused projects to selected instead of unselected", () => {
    const selection = focusProject(
      selectProject(createProjectStackSelection("project-1"))
    );

    expect(clearProjectFocus(selection).state).toBe("selected");
  });
});

