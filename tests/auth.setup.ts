import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { test as setup } from '@playwright/test';
import { appConfig, getCredentials } from '../src/config/env.js';
import { disablePasskeyPrompts, MicrosoftLoginPage } from '../src/pages/microsoft-login.page.js';
import { ExcelWorkbookPage } from '../src/pages/excel-workbook.page.js';

/**
 * Signs in to the Microsoft account once and stores the resulting cookies and
 * local storage, which every later test starts from.
 *
 * The step is idempotent: with a valid cached session, Excel opens straight away
 * and no credentials are needed at all.
 */
setup('authenticate with the Microsoft account', async ({ page }) => {
  const workbook = new ExcelWorkbookPage(page, appConfig);

  // Must be installed before the first navigation, otherwise the sign-in page
  // has already decided to ask for a passkey.
  await disablePasskeyPrompts(page.context());

  await setup.step('open Excel for the web', async () => {
    await page.goto(appConfig.newWorkbookUrl, { waitUntil: 'domcontentloaded' });
  });

  const login = new MicrosoftLoginPage(page, appConfig.actionTimeoutMs);
  if (await login.isShowing(15_000)) {
    await setup.step('sign in', async () => {
      await login.signIn(getCredentials());
    });
  }

  await setup.step('confirm the account can edit workbooks', async () => {
    await workbook.waitForEditorReady();
  });

  mkdirSync(dirname(appConfig.storageStatePath), { recursive: true });
  await page.context().storageState({ path: appConfig.storageStatePath });
});
