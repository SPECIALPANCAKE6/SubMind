import { describe, expect, it } from "vitest";

import { createWorkerPlan, supportedCheckpoints } from "../src/index";

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
});

