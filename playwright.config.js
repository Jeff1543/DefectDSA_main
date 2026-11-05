import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.E2E_PORT || "8765";
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Opsional: pakai Chromium yang sudah ada (mis. di CI/sandbox) alih-alih hasil `playwright install`.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.js",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "tests/.report" }]],
  outputDir: "tests/.results",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testIgnore: "**/responsive.spec.js",
    },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: "**/responsive.spec.js" },
  ],
  webServer: {
    command: "python tests/e2e/run_server.py",
    url: `${BASE_URL}/static/index.html`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { E2E_PORT: PORT },
  },
});
