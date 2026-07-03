import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
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
  }
});
