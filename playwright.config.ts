import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// The four screen sizes from the brief. Phone sizes also emulate touch.
const SIZES = [
  { name: "phone-360", width: 360, height: 800, mobile: true },
  { name: "phone-390", width: 390, height: 844, mobile: true },
  { name: "tablet-768", width: 768, height: 1024, mobile: true },
  { name: "desktop-1440", width: 1440, height: 900, mobile: false },
];

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    ...SIZES.map((s) => ({
      name: s.name,
      testIgnore: /admin\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: s.width, height: s.height },
        isMobile: s.mobile,
        hasTouch: s.mobile,
      },
    })),
    // The admin tests change the shared (in-memory) menu, so they run after
    // all other tests, one size at a time, and reset the data when done.
    {
      name: "admin-phone-390",
      testMatch: /admin\.spec\.ts/,
      dependencies: SIZES.map((s) => s.name),
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    {
      name: "admin-desktop-1440",
      testMatch: /admin\.spec\.ts/,
      dependencies: ["admin-phone-390"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    // Production build with scripted AI replies so browser tests are predictable.
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      AI_MOCK: "true",
      GEMINI_API_KEY: "",
      CHAT_RATE_LIMIT_PER_MINUTE: "1000",
      // An in-memory menu store, so browser tests never write to the real database.
      DATA_STORE: "memory",
      DATABASE_URL: "",
      // A test-only password (not the real one), and a non-Secure cookie for http://localhost.
      ADMIN_PASSWORD: "e2e-admin-password",
      ADMIN_INSECURE_COOKIE: "true",
    },
  },
});
