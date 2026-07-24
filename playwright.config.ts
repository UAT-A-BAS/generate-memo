import { defineConfig } from "@playwright/test";

process.env.NEXT_PUBLIC_COLLAB_WORKER_URL ??= "http://127.0.0.1:8787";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3002",
    timezoneId: "Asia/Bangkok",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npx wrangler@4.101.0 dev --config wrangler.collab.toml --port 8787",
      url: "http://127.0.0.1:8787/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "npm run serve:e2e",
      url: "http://127.0.0.1:3002",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
