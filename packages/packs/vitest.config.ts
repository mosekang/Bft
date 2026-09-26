import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "packs",
    include: ["test/**/*.test.ts"],
  },
});
