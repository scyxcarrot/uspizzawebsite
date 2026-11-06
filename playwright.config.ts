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
  projects: SIZES.map((s) => ({
    name: s.name,
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width: s.width, height: s.height },
      isMobile: s.mobile,
      hasTouch: s.mobile,
    },
  })),
  webServer: {
    // Production build with scripted AI replies so browser tests are predictable.
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: { AI_MOCK: "true", GEMINI_API_KEY: "", CHAT_RATE_LIMIT_PER_MINUTE: "1000" },
  },
});
