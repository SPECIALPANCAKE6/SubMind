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

