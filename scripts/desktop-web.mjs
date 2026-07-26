import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const desktopDir = join(rootDir, "apps", "desktop");

const mode = process.argv[2];
const validModes = new Set(["build", "dev"]);

if (!validModes.has(mode)) {
  console.error("Usage: node scripts/desktop-web.mjs <build|dev>");
  process.exit(2);
}

const tscEntrypoint = join(rootDir, "node_modules", "typescript", "bin", "tsc");
const viteEntrypoint = resolveFirstExisting([
  join(rootDir, "node_modules", "vite", "bin", "vite.js"),
  join(rootDir, "node_modules", "vite", "dist", "node", "cli.js")
]);

for (const entrypoint of [tscEntrypoint, viteEntrypoint].filter(Boolean)) {
  if (!existsSync(entrypoint)) {
    console.error(`Missing dependency entrypoint: ${entrypoint}`);
    console.error("Run pnpm install from the repository root first.");
    process.exit(1);
  }
}

if (!viteEntrypoint) {
  console.error("Missing dependency entrypoint for Vite.");
  console.error("Run pnpm install from the repository root first.");
  process.exit(1);
}

await runNode(tscEntrypoint, ["-b", "--force"], rootDir);

const viteArgs =
  mode === "build"
    ? ["build", "--config", "vite.config.ts"]
    : ["--config", "vite.config.ts"];

await runNode(viteEntrypoint, viteArgs, desktopDir);

function resolveFirstExisting(candidates) {
  return candidates.find((candidate) => existsSync(candidate));
}

function runNode(entrypoint, args, cwd) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [entrypoint, ...args], {
      cwd,
      env: process.env,
      stdio: "inherit"
    });

    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (signal) {
        rejectRun(new Error(`${entrypoint} exited after signal ${signal}`));
        return;
      }

      if (code !== 0) {
        rejectRun(new Error(`${entrypoint} exited with code ${code}`));
        return;
      }

      resolveRun();
    });
  });
}
