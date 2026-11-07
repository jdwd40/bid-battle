import { defineConfig, devices } from '@playwright/test';

const PORT = 3101;

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // Serve the production web build from the game server with fast bots and short timers.
    command: `npm run build -w @bid-battle/web && PORT=${PORT} BOT_DELAY_MS=100 TURN_MS=8000 COUNTER_MS=4000 REVIEW_MS=20000 STATIC_DIR=packages/web/dist npx tsx packages/server/src/index.ts`,
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
