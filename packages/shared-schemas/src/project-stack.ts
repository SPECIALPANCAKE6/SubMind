export const projectStackStates = ["unselected", "selected", "focused"] as const;

export type ProjectStackState = (typeof projectStackStates)[number];

export const projectStackTransitions: Record<
  ProjectStackState,
  readonly ProjectStackState[]
> = {
  unselected: ["selected"],
  selected: ["unselected", "focused"],
  focused: ["selected"]
};

export const projectStackInteractionRules = {
  select: "single_click",
  focus: "explicit_action_or_double_click"
} as const;
