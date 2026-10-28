import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  reporter: "list",
  use: { baseURL: "http://localhost:5173", ...devices["iPhone 13"], browserName: "chromium", trace: "retain-on-failure" },
  webServer: { command: "node tests/serve.mjs", url: "http://localhost:5173/index.html", reuseExistingServer: true },
});
