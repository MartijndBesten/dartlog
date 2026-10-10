import { defineConfig, devices } from '@playwright/test';

const channel = process.env.PW_CHANNEL || 'chrome';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 1, // laptop met 4 GB: één browser tegelijk
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', serviceWorkers: 'allow' },
  webServer: [
    { command: 'node tools/serve.mjs 4173', url: 'http://localhost:4173', reuseExistingServer: true },
    // Afgeschermde test-API voor Mijn vrienden (echte Worker-code, tijdelijke SQLite in het geheugen).
    { command: 'node tools/dev-api.mjs 8799', url: 'http://127.0.0.1:8799/v1/health', reuseExistingServer: true },
    // De gebouwde website zoals op okkiedarts.nl (dist/), voor tests/e2e/site.spec.js.
    { command: 'node tools/build-public-site.mjs && node tools/serve.mjs 4174 dist', url: 'http://localhost:4174', reuseExistingServer: true },
  ],
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'chromium', channel } },
    { name: 'android', use: { ...devices['Pixel 7'], channel } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel } },
  ],
});
