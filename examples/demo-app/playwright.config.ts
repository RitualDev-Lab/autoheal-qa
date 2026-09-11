import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 10000,
  use: {
    headless: true,
  },
  reporter: [["list"], ["@autoheal/interceptor", { outputFile: "autoheal-failures.json" }]],
});
