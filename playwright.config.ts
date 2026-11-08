import { defineConfig, devices } from '@playwright/test';

/**
 * Web regression suite. Runs against the Firebase emulators (demo-arthapath)
 * and the Angular dev server: `npm run test:e2e`.
 *
 * Locally you can reuse an installed Chromium-based browser instead of
 * downloading one: E2E_BROWSER_PATH="C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe"
 * CI installs Playwright's Chromium.
 */
const executablePath = process.env['E2E_BROWSER_PATH'] || undefined;
const port = 4300;

export default defineConfig({
  testDir: 'e2e',
  testIgnore: '**/screenshots.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } } }],
  webServer: {
    command: `npx ng serve --port ${port}`,
    url: `http://localhost:${port}`,
    timeout: 180_000,
    reuseExistingServer: !process.env['CI'],
  },
});
