export const eventTaxonomy = [
  "lifecycle",
  "work_change",
  "guidance",
  "memory",
  "action",
  "subagent",
  "system_user"
] as const;

export type EventTaxonomy = (typeof eventTaxonomy)[number];

export const eventOrigins = [
  "codex",
  "submind",
  "subagent",
  "system",
  "user"
] as const;

export type EventOrigin = (typeof eventOrigins)[number];

export const eventNodeCategories = [
  "anchor",
  "change",
  "cognitive",
  "control",
  "delegation",
  "marker"
] as const;

export type EventNodeCategory = (typeof eventNodeCategories)[number];
