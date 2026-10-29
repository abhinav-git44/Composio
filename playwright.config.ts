import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against the production build (`npm run build` first).
 * - :3100 runs with COMPASS_AGENT_MODE=fixture (scripted agent, no network, clearly labelled as test data)
 * - :3101 runs with no API key, to test the "not configured" path
 */
const dataDir = process.env.E2E_DATA_DIR ?? ".e2e-data";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", trace: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: [
    {
      command: `rm -rf ${dataDir} && COMPASS_AGENT_MODE=fixture COMPASS_DATA_DIR=${dataDir}/fixture COMPASS_RATE_LIMIT=100 npx next start -p 3100`,
      url: "http://localhost:3100",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `env -u ANTHROPIC_API_KEY -u GEMINI_API_KEY COMPASS_DATA_DIR=${dataDir}/unconfigured npx next start -p 3101`,
      url: "http://localhost:3101",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
