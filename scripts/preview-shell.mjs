import { createDesktopBootstrap } from "@submind/desktop";

const timestamp = new Date().toISOString();

const bootstrap = createDesktopBootstrap({
  kind: "Project",
  id: "project-submind",
  profileId: "profile-operator",
  name: "SubMind",
  description: "Shell preview bootstrap",
  state: "selected",
  createdAt: timestamp,
  updatedAt: timestamp
});

console.log(JSON.stringify(bootstrap, null, 2));
