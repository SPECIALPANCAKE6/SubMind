import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;
const isTauri = process.env.TAURI_ENV_PLATFORM !== undefined;
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  resolve: {
    alias: {
      "@submind/core": resolve(rootDir, "packages/core/src/index.ts"),
      "@submind/policy": resolve(rootDir, "packages/policy/src/index.ts"),
      "@submind/protocol-codex": resolve(
        rootDir,
        "packages/protocol-codex/src/index.ts"
      ),
      "@submind/protocol-copilot": resolve(
        rootDir,
        "packages/protocol-copilot/src/index.ts"
      ),
      "@submind/protocol-hermes": resolve(
        rootDir,
        "packages/protocol-hermes/src/index.ts"
      ),
      "@submind/shared-schemas": resolve(
        rootDir,
        "packages/shared-schemas/src/index.ts"
      ),
      "@submind/store": resolve(rootDir, "packages/store/src/index.ts"),
      "@submind/ui-components": resolve(
        rootDir,
        "packages/ui-components/src/index.tsx"
      ),
      "@submind/ui-state": resolve(rootDir, "packages/ui-state/src/index.ts"),
      "@submind/workers": resolve(rootDir, "packages/workers/src/index.ts")
    }
  },
  server: {
    host: host || "127.0.0.1",
    port: 4173,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"]
    }
  },
  build: {
    outDir: "web-dist",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    target: isTauri ? "chrome105" : "es2022"
  }
});
