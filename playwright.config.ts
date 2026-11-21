import { defineConfig, devices } from '@playwright/test';

// E2E_PORT moves both servers (PORT and PORT + 1), so test runs in separate worktrees don't collide.
const PORT = Number(process.env.E2E_PORT ?? 3101);
// The phone project gets its own server with one-round matches, so its solo match reaches the match results quickly.
const PHONE_PORT = PORT + 1;
// The full-match server's address, for phone tests that need more than one round (the phone project's own server plays one).
process.env.E2E_FULL_MATCH_URL = `http://127.0.0.1:${PORT}`;
const SERVER_ENV = 'BOT_DELAY_MS=100 TURN_MS=8000 COUNTER_MS=4000 REVIEW_MS=20000 ROOMS_PER_IP=1000 STATIC_DIR=packages/web/dist';

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_FULL_MATCH_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      // Serve the production web build from the game server with fast bots, short timers and room limits high enough for every test.
      command: `npm run build -w @bid-battle/web && PORT=${PORT} ${SERVER_ENV} npx tsx packages/server/src/index.ts`,
      url: `http://127.0.0.1:${PORT}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Started after the first server is up, so the web build above is already done.
      command: `PORT=${PHONE_PORT} ROUNDS=1 ${SERVER_ENV} npx tsx packages/server/src/index.ts`,
      url: `http://127.0.0.1:${PHONE_PORT}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /phone\.spec\.ts$/ },
    {
      // A phone-sized Chromium at iPhone SE size (375×667); set the viewport per test where it differs. Phone layout specs go in phone.spec.ts and
      // use the helpers in e2e/support/layout.ts. Its server plays one-round matches; E2E_FULL_MATCH_URL is the full-match server.
      name: 'phone',
      use: { ...devices['Pixel 5'], viewport: { width: 375, height: 667 }, baseURL: `http://127.0.0.1:${PHONE_PORT}` },
      testMatch: /phone\.spec\.ts$/,
    },
  ],
});
