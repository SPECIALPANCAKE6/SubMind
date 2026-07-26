import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import os from "node:os";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const desktopDir = join(rootDir, "apps", "desktop");
const require = createRequire(import.meta.url);
const tauriEntrypoint = resolveFirstExisting([
  join(rootDir, "node_modules", "@tauri-apps", "cli", "main.js")
]);

if (!tauriEntrypoint) {
  console.error("Missing dependency entrypoint for the Tauri CLI.");
  console.error("Run pnpm install from the repository root first.");
  process.exit(1);
}

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: node scripts/run-tauri.mjs <tauri-command> [...args]");
  process.exit(2);
}

const apiConfig = ensureLocalApiConfig();
const cargoBin = join(os.homedir(), ".cargo", "bin");
const env = {
  ...process.env,
  ...apiConfig.env,
  PATH: [cargoBin, process.env.PATH].filter(Boolean).join(delimiter)
};
const nativeBinding = resolveTauriNativeBinding();

if (!nativeBinding) {
  const target = getTauriNativeTarget();
  console.error(`Missing Tauri native CLI binding for ${target.label}.`);
  console.error(
    "node_modules is incomplete. Run `pnpm install` from the repository root and accept the node_modules reinstall prompt once."
  );
  console.error(
    "Avoid `npm install` for this workspace; npm can omit optional native packages that Tauri needs."
  );
  process.exit(1);
}

if (tauriEntrypoint.endsWith("main.js")) {
  Object.assign(process.env, env);
  process.chdir(desktopDir);

  const previousNativeLibraryPath = process.env.NAPI_RS_NATIVE_LIBRARY_PATH;
  process.env.NAPI_RS_NATIVE_LIBRARY_PATH = nativeBinding.path;
  let tauri;

  try {
    tauri = require(tauriEntrypoint);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    restoreNativeLibraryPath(previousNativeLibraryPath);
  }

  try {
    await tauri.run(args, "tauri");
  } catch (error) {
    tauri.logError(error);
    process.exit(1);
  }

  process.exit(0);
}

const child = spawn(process.execPath, [tauriEntrypoint, ...args], {
  cwd: desktopDir,
  env,
  stdio: "inherit"
});

child.once("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

child.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

function resolveFirstExisting(candidates) {
  return candidates.find((candidate) => existsSync(candidate));
}

function ensureLocalApiConfig() {
  const tokenDir = join(os.homedir(), ".config", "submind");
  const tokenPath = join(tokenDir, "api-token");
  const existingEnvToken = process.env.SUBMIND_API_TOKEN?.trim();
  let token = "";

  mkdirSync(tokenDir, {
    recursive: true,
    mode: 0o700
  });

  if (existsSync(tokenPath)) {
    token = readFileSync(tokenPath, "utf8").replace(/[\r\n]/g, "").trim();
  } else if (existingEnvToken && existingEnvToken.length >= 32) {
    token = existingEnvToken;
    writeFileSync(tokenPath, token, {
      encoding: "utf8",
      mode: 0o600
    });
  } else {
    token = `sm_${randomBytes(32).toString("hex")}`;
    writeFileSync(tokenPath, token, {
      encoding: "utf8",
      mode: 0o600
    });
  }

  if (process.platform !== "win32") {
    try {
      chmodSync(tokenDir, 0o700);
      chmodSync(tokenPath, 0o600);
    } catch {
      // Permission normalization is best-effort on shared or mounted filesystems.
    }
  }

  if (token.length < 32) {
    console.error(`SubMind API token at ${tokenPath} is too short.`);
    console.error("Delete it and rerun this command to generate a new token.");
    process.exit(1);
  }

  console.error(`SubMind local API token: ${tokenPath}`);

  return {
    env: {
      SUBMIND_API_TOKEN: token,
      SUBMIND_API_URL: process.env.SUBMIND_API_URL || "http://127.0.0.1:47821",
      SUBMIND_API_PORT: process.env.SUBMIND_API_PORT || "47821"
    }
  };
}

function restoreNativeLibraryPath(previousValue) {
  if (previousValue === undefined) {
    delete process.env.NAPI_RS_NATIVE_LIBRARY_PATH;
  } else {
    process.env.NAPI_RS_NATIVE_LIBRARY_PATH = previousValue;
  }
}

function resolveTauriNativeBinding() {
  const target = getTauriNativeTarget();
  const directCandidates = target.candidates.map((candidate) =>
    join(
      rootDir,
      "node_modules",
      ...candidate.packageName.split("/"),
      candidate.binaryName
    )
  );
  const directPath = resolveFirstExisting(directCandidates);

  if (directPath) {
    return { path: directPath };
  }

  const pnpmDir = join(rootDir, "node_modules", ".pnpm");

  if (!existsSync(pnpmDir)) {
    return null;
  }

  for (const entry of readdirSync(pnpmDir)) {
    for (const targetCandidate of target.candidates) {
      const encodedPackageName = targetCandidate.packageName.replace("/", "+");

      if (!entry.startsWith(`${encodedPackageName}@`)) {
        continue;
      }

      const candidate = join(
        pnpmDir,
        entry,
        "node_modules",
        ...targetCandidate.packageName.split("/"),
        targetCandidate.binaryName
      );

      if (existsSync(candidate)) {
        return { path: candidate };
      }
    }
  }

  return null;
}

function getTauriNativeTarget() {
  const platform = process.platform;
  const arch = process.arch;
  const variants = [];

  if (platform === "win32") {
    if (arch === "x64") variants.push("win32-x64-msvc");
    if (arch === "arm64") variants.push("win32-arm64-msvc");
    if (arch === "ia32") variants.push("win32-ia32-msvc");
  } else if (platform === "darwin") {
    if (arch === "x64") variants.push("darwin-x64");
    if (arch === "arm64") variants.push("darwin-arm64");
  } else if (platform === "linux") {
    if (arch === "x64") variants.push("linux-x64-gnu", "linux-x64-musl");
    if (arch === "arm64") variants.push("linux-arm64-gnu", "linux-arm64-musl");
    if (arch === "arm") variants.push("linux-arm-gnueabihf");
    if (arch === "riscv64") variants.push("linux-riscv64-gnu");
  }

  if (variants.length === 0) {
    return {
      label: `${platform}-${arch}`,
      candidates: []
    };
  }

  return {
    label: variants.join(" or "),
    candidates: variants.map((variant) => ({
      packageName: `@tauri-apps/cli-${variant}`,
      binaryName: `cli.${variant}.node`
    }))
  };
}
