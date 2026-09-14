import type { Page } from '@playwright/test';
import type { Credentials } from '../config/env.js';
import { anyVisible, clickIfPresent, isAnyVisible } from '../utils/locators.js';

const selectors = {
  emailInput: ['input[type="email"]', 'input[name="loginfmt"]', '#i0116'],
  passwordInput: ['input[type="password"]', 'input[name="passwd"]', '#i0118'],
  primaryButton: ['input[type="submit"]', 'button[type="submit"]', '#idSIButton9'],
  /** Modern sign-in offers passkeys first; this link goes back to the password. */
  usePasswordInstead: ['#idA_PWD_SwitchToPassword', 'a:has-text("Use your password")'],
  /** "Stay signed in?" - answering yes keeps the saved storage state useful for longer. */
  staySignedInPrompt: ['#KmsiCheckboxField', '#idSIButton9[data-report-event="Signin_Submit"]'],
  /** Screens this test cannot get past on its own. */
  interactionRequired: [
    '#idDiv_SAOTCS_Title',
    '#idDiv_SAOTCC_Title',
    '[data-testid="authenticatorAppTitle"]',
    '#ProofUpDescription',
    '#idDiv_SAASDS_Title',
  ],
  errorText: ['#passwordError', '#usernameError', '[role="alert"]'],
} as const;

/**
 * Drives the Microsoft identity platform sign-in (login.microsoftonline.com).
 *
 * Deliberately narrow: it handles the e-mail + password + "stay signed in"
 * happy path and fails fast, with an actionable message, on anything that needs
 * a human (MFA, password change, consent).
 */
export class MicrosoftLoginPage {
  constructor(
    private readonly page: Page,
    private readonly timeoutMs: number,
  ) {}

  /** True when the sign-in form is currently on screen. */
  async isShowing(timeoutMs = this.timeoutMs): Promise<boolean> {
    return isAnyVisible(this.page, selectors.emailInput, timeoutMs);
  }

  async signIn({ email, password }: Credentials): Promise<void> {
    await anyVisible(this.page, selectors.emailInput).fill(email);
    await this.submit();

    await clickIfPresent(this.page, selectors.usePasswordInstead, 3_000);

    const passwordField = anyVisible(this.page, selectors.passwordInput);
    await passwordField.waitFor({ state: 'visible', timeout: this.timeoutMs }).catch(async () => {
      throw new Error(await this.describeBlockingScreen('The password field never appeared.'));
    });
    await passwordField.fill(password);
    await this.submit();

    await this.handleStaySignedIn();
    await this.failIfStillOnSignIn();
  }

  private async submit(): Promise<void> {
    await anyVisible(this.page, selectors.primaryButton).click({ timeout: this.timeoutMs });
  }

  /**
   * Answering "Yes" to *Stay signed in?* issues a persistent cookie, which is what
   * makes the cached storage state worth reusing between runs.
   */
  private async handleStaySignedIn(): Promise<void> {
    if (await isAnyVisible(this.page, selectors.staySignedInPrompt, 8_000)) {
      await clickIfPresent(this.page, selectors.primaryButton, this.timeoutMs);
    }
  }

  /** Once the credentials are accepted we are redirected away from the identity provider. */
  private async failIfStillOnSignIn(): Promise<void> {
    await this.page
      .waitForURL((url) => !url.hostname.endsWith('login.microsoftonline.com'), {
        timeout: this.timeoutMs,
      })
      .catch(async () => {
        throw new Error(await this.describeBlockingScreen('Sign-in did not complete.'));
      });
  }

  /** Turns a stuck sign-in into a message that says what to do about it. */
  private async describeBlockingScreen(prefix: string): Promise<string> {
    const details: string[] = [prefix];

    const error = await anyVisible(this.page, selectors.errorText)
      .textContent({ timeout: 2_000 })
      .catch(() => null);
    if (error?.trim()) {
      details.push(`Microsoft reported: "${error.trim()}"`);
    }

    if (await isAnyVisible(this.page, selectors.interactionRequired, 2_000)) {
      details.push(
        'The account is asking for a second factor or another one-off confirmation. ' +
          'This suite signs in with an e-mail and a password only - use a dedicated test ' +
          'account without MFA, or run `npm run auth:manual` once to record the session by hand.',
      );
    }

    details.push(`Current URL: ${this.page.url()}`);
    return details.join('\n');
  }
}
