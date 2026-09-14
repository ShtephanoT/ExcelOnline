import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { appConfig } from './src/config/env.js';

/**
 * Three projects, run in this order:
 *
 *   unit   - pure logic (date parsing/expectations). No browser, runs anywhere.
 *   setup  - signs in once and caches the session in `storageState`.
 *   excel  - the end-to-end test, starting from that cached session.
 *
 * Splitting sign-in out of the test keeps the test about TODAY() and means a
 * re-run does not hammer login.microsoftonline.com (which throttles and starts
 * showing CAPTCHAs).
 */
const storageStateExists = existsSync(appConfig.storageStatePath);

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 5 * 60 * 1000,
  expect: { timeout: appConfig.actionTimeoutMs },

  use: {
    actionTimeout: appConfig.actionTimeoutMs,
    navigationTimeout: appConfig.appLoadTimeoutMs,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'unit',
      testDir: './tests/unit',
    },
    {
      name: 'setup',
      testDir: './tests',
      testMatch: /auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        channel: appConfig.browserChannel,
        headless: appConfig.headless,
        launchOptions: { slowMo: appConfig.slowMo },
        locale: appConfig.locale,
        timezoneId: appConfig.timezoneId,
        // Re-use an earlier session when there is one, so signing in is a rare event.
        storageState: storageStateExists ? appConfig.storageStatePath : undefined,
      },
    },
    {
      name: 'excel-chrome',
      testDir: './tests/e2e',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        channel: appConfig.browserChannel,
        headless: appConfig.headless,
        launchOptions: { slowMo: appConfig.slowMo },
        locale: appConfig.locale,
        timezoneId: appConfig.timezoneId,
        storageState: appConfig.storageStatePath,
        // Reading a cell's rendered value is done by copying it (see the page object).
        permissions: ['clipboard-read', 'clipboard-write'],
        // Every run leaves a video behind - that is the demo recording.
        video: 'on',
      },
    },
  ],
});
