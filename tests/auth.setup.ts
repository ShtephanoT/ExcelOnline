import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { test as setup } from '@playwright/test';
import { appConfig, getCredentials } from '../src/config/env.js';
import { disablePasskeyPrompts, MicrosoftLoginPage } from '../src/pages/microsoft-login.page.js';
import { ExcelWorkbookPage } from '../src/pages/excel-workbook.page.js';

setup('authenticate with the Microsoft account', async ({ page }) => {
  await disablePasskeyPrompts(page.context());
  await page.goto(appConfig.newWorkbookUrl, { waitUntil: 'domcontentloaded' });

  const login = new MicrosoftLoginPage(page, appConfig.actionTimeoutMs);
  if (await login.isShowing(15_000)) {
    await setup.step('sign in', () => login.signIn(getCredentials()));
  }

  await setup.step('confirm the account can edit workbooks', () =>
    new ExcelWorkbookPage(page, appConfig).waitForEditorReady(),
  );

  mkdirSync(dirname(appConfig.storageStatePath), { recursive: true });
  await page.context().storageState({ path: appConfig.storageStatePath });
});
