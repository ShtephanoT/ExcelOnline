import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { Credentials } from '../config/env.js';
import { anyVisible, clickIfPresent, isAnyVisible } from '../utils/locators.js';

const selectors = {
  emailInput: ['input[type="email"]', 'input[name="loginfmt"]', '#usernameEntry', '#i0116'],
  passwordInput: ['input[type="password"]', 'input[name="passwd"]', '#passwordEntry', '#i0118'],
  primaryButton: [
    'button[data-testid="primaryButton"]',
    'input[type="submit"]',
    'button[type="submit"]',
    '#idSIButton9',
  ],
  switchToPassword: ['#idA_PWD_SwitchToPassword', '[data-value="Password"]'],
  switchToOtherCredential: [
    '#idA_PWD_SwitchToCredPicker',
    '#signInAnotherWay',
    'a[id^="idA_PWD_"]',
  ],
  staySignedInPrompt: ['#KmsiCheckboxField', '#idSIButton9[data-report-event="Signin_Submit"]'],
  interactionRequired: [
    '[data-testid="tileList"]',
    'input[name="otc"]',
    '#idTxtBx_OTC_Password',
    '[data-testid="authenticatorAppTitle"]',
    '#idDiv_SAOTCS_Title',
    '#ProofUpDescription',
  ],
  errorText: ['#passwordError', '#usernameError', '[role="alert"]'],
  heading: ['[data-testid="title"]', '[role="heading"]', '#loginHeader', 'h1'],
} as const;

const IDENTITY_PROVIDER_HOSTS = [
  'login.microsoftonline.com',
  'login.microsoft.com',
  'login.live.com',
  'account.live.com',
];

export function isIdentityProviderHost(hostname: string): boolean {
  return IDENTITY_PROVIDER_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

const SUBMIT_TIMEOUT_MS = 5_000;
const ERROR_BANNER_TIMEOUT_MS = 2_500;
const SECOND_FACTOR_TIMEOUT_MS = 6_000;

export async function disablePasskeyPrompts(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true });
  });
}

export class MicrosoftLoginPage {
  constructor(
    private readonly page: Page,
    private readonly timeoutMs: number,
  ) {}

  async isShowing(timeoutMs = this.timeoutMs): Promise<boolean> {
    return isAnyVisible(this.page, selectors.emailInput, timeoutMs);
  }

  async signIn({ email, password }: Credentials): Promise<void> {
    const emailField = anyVisible(this.page, selectors.emailInput);
    await emailField.fill(email);
    await this.submit(emailField);
    await this.failIfErrorShown(
      'Check MS_EMAIL in .env: it must be an existing Microsoft account.',
    );

    await this.ensurePasswordPrompt();
    const passwordField = anyVisible(this.page, selectors.passwordInput);
    await passwordField.fill(password);
    await this.submit(passwordField);
    await this.failIfErrorShown('Check MS_PASSWORD in .env.');
    await this.failIfBlocked(
      'The password was accepted, but the account then asked for a second factor (a one-time ' +
        'code). A scripted e-mail + password sign-in cannot satisfy that.',
    );

    await this.handleStaySignedIn();
    await this.failIfStillOnSignIn();
  }

  private async submit(activeField: Locator): Promise<void> {
    try {
      await anyVisible(this.page, selectors.primaryButton).click({ timeout: SUBMIT_TIMEOUT_MS });
    } catch {
      await activeField.press('Enter');
    }
  }

  private async ensurePasswordPrompt(): Promise<void> {
    const recoveries = [
      () => clickIfPresent(this.page, selectors.switchToPassword, 3_000),
      async () => {
        await clickIfPresent(this.page, selectors.switchToOtherCredential, 3_000);
        await clickIfPresent(this.page, selectors.switchToPassword, 5_000);
      },
    ];

    if (await isAnyVisible(this.page, selectors.passwordInput, 10_000)) return;
    for (const recover of recoveries) {
      await recover();
      if (await isAnyVisible(this.page, selectors.passwordInput, 5_000)) return;
    }
    throw new Error(await this.describe('The password field never appeared.'));
  }

  private async failIfErrorShown(hint: string): Promise<void> {
    const error = await this.textOf(selectors.errorText, ERROR_BANNER_TIMEOUT_MS);
    if (error) {
      throw new Error(`Microsoft rejected the sign-in: "${error}"\n${hint}`);
    }
  }

  private async failIfBlocked(reason: string): Promise<void> {
    if (await isAnyVisible(this.page, selectors.interactionRequired, SECOND_FACTOR_TIMEOUT_MS)) {
      throw new Error(await this.describe(reason));
    }
  }

  private async handleStaySignedIn(): Promise<void> {
    if (await isAnyVisible(this.page, selectors.staySignedInPrompt, 8_000)) {
      await clickIfPresent(this.page, selectors.primaryButton, this.timeoutMs);
    }
  }

  private async failIfStillOnSignIn(): Promise<void> {
    await this.page
      .waitForURL((url) => !isIdentityProviderHost(url.hostname), { timeout: this.timeoutMs })
      .catch(async () => {
        throw new Error(await this.describe('Sign-in did not complete.'));
      });
  }

  private async describe(reason: string): Promise<string> {
    const [error, heading] = await Promise.all([
      this.textOf(selectors.errorText, 2_000),
      this.textOf(selectors.heading, 2_000),
    ]);

    return [
      reason,
      error && `Microsoft reported: "${error}"`,
      heading && `Screen heading: "${heading}"`,
      'This suite signs in with an e-mail and a password only. If the account cannot - MFA, a ' +
        'passkey-only account, Conditional Access - run `npm run auth:manual` once to sign in by ' +
        'hand; the saved session is reused afterwards.',
      `Current URL: ${this.page.url()}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async textOf(candidates: readonly string[], timeoutMs: number): Promise<string> {
    const text = await anyVisible(this.page, candidates)
      .textContent({ timeout: timeoutMs })
      .catch(() => null);
    return text?.trim() ?? '';
  }
}
