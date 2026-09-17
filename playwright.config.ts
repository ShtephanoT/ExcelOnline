import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { appConfig } from './src/config/env.js';

const chrome = {
  ...devices['Desktop Chrome'],
  channel: appConfig.browserChannel,
  headless: appConfig.headless,
  launchOptions: { slowMo: appConfig.slowMo },
  locale: appConfig.locale,
  timezoneId: appConfig.timezoneId,
};

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
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
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'unit', testDir: './tests/unit' },
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: {
        ...chrome,
        storageState: existsSync(appConfig.storageStatePath)
          ? appConfig.storageStatePath
          : undefined,
      },
    },
    {
      name: 'excel-chrome',
      testDir: './tests/e2e',
      dependencies: ['setup'],
      use: {
        ...chrome,
        storageState: appConfig.storageStatePath,
        permissions: ['clipboard-read', 'clipboard-write'],
        video: 'on',
      },
    },
  ],
});
