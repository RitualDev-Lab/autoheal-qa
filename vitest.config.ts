import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@autoheal/core": path.resolve(__dirname, "packages/core/src/index.ts"),
      "@autoheal/ai": path.resolve(__dirname, "packages/ai/src/index.ts"),
      "@autoheal/interceptor": path.resolve(__dirname, "packages/interceptor/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
  },
});
