import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*", "apps/server", "apps/web"],
    coverage: {
      provider: "v8",
      include: ["packages/engine/src/**/*.ts", "packages/packs/src/**/*.ts", "packages/protocol/src/**/*.ts"],
      exclude: ["**/index.ts", "packages/packs/src/cli.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
