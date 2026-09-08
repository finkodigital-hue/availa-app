import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
const hasCredentials = Boolean(
  process.env.E2E_EMAIL && process.env.E2E_PASSWORD,
);

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --host 127.0.0.1 --port 4173",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    ...(hasCredentials
      ? [{ name: "auth-setup", testMatch: /auth\.setup\.ts/ }]
      : []),
    {
      name: "public-chromium",
      testIgnore: [
        /auth\.setup\.ts/,
        /workspace\.spec\.ts/,
        /responsive-navigation\.spec\.ts/,
      ],
      use: { ...devices["Desktop Chrome"] },
    },
    ...(hasCredentials
      ? [
          {
            name: "workspace-chromium",
            dependencies: ["auth-setup"],
            testMatch: [
              /workspace\.spec\.ts/,
              /responsive-navigation\.spec\.ts/,
            ],
            use: {
              ...devices["Desktop Chrome"],
              storageState: "playwright/.auth/user.json",
            },
          },
        ]
      : []),
  ],
});
