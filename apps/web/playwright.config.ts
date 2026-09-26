import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 600_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath: process.env["PW_CHROMIUM"] ?? "/opt/pw-browsers/chromium" },
  },
  projects: [{ name: "pixel5", use: { ...devices["Pixel 5"], launchOptions: { executablePath: process.env["PW_CHROMIUM"] ?? "/opt/pw-browsers/chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } } }],
  webServer: [
    {
      command: "pnpm exec vite preview --port 4173 --strictPort",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @dugout/server dev:node",
      url: "http://127.0.0.1:8787/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
