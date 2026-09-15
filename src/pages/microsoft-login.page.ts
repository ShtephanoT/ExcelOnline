import type { BrowserContext, Page } from '@playwright/test';
import type { Credentials } from '../config/env.js';
import { anyVisible, clickIfPresent, isAnyVisible } from '../utils/locators.js';

/**
 * Selectors are id- and attribute-based on purpose.
 *
 * The sign-in UI is served in the language of the account (or of the client's
 * region), not in the browser locale, so matching on visible text is not an
 * option - a run can just as easily be shown Ukrainian, German or Japanese.
 * Microsoft's element ids, by contrast, are stable across languages.
 */
const selectors = {
  emailInput: ['input[type="email"]', 'input[name="loginfmt"]', '#i0116'],
  passwordInput: ['input[type="password"]', 'input[name="passwd"]', '#i0118'],
  primaryButton: ['input[type="submit"]', 'button[type="submit"]', '#idSIButton9'],

  /** "Use your password instead" - shown on the passkey / approve-request screens. */
  switchToPassword: ['#idA_PWD_SwitchToPassword', '[data-value="Password"]'],
  /** "Sign in another way" - opens the list of available credentials. */
  switchToOtherCredential: [
    '#idA_PWD_SwitchToCredPicker',
    '#signInAnotherWay',
    '#idA_PWD_SwitchToRemoteNGC',
    'a[id^="idA_PWD_"]',
  ],
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
 * Stops Microsoft from steering the sign-in into a passkey (WebAuthn) flow.
 *
 * When the browser advertises WebAuthn support and the account has a passkey or
 * Windows Hello enrolled, the sign-in page skips the password entirely and asks
 * for the platform authenticator - which an automated browser cannot satisfy,
 * so the run dead-ends on "We couldn't sign you in with a passkey".
 *
 * The page decides by feature-detecting `window.PublicKeyCredential`, so hiding
 * that one property is enough to be offered the password instead. Recovering
 * from the passkey screen after the fact is also implemented (see
 * {@link MicrosoftLoginPage.ensurePasswordPrompt}), but not entering it at all
 * is both faster and far less brittle.
 */
export async function disablePasskeyPrompts(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: undefined,
      configurable: true,
    });
  });
}

/**
 * Drives the Microsoft identity platform sign-in (login.microsoftonline.com).
 *
 * Deliberately narrow: it handles the e-mail + password + "stay signed in"
 * happy path and fails fast, with an actionable message, on anything that needs
 * a human (MFA, a password change, consent).
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

    await this.ensurePasswordPrompt();
    await anyVisible(this.page, selectors.passwordInput).fill(password);
    await this.submit();

    await this.handleStaySignedIn();
    await this.failIfStillOnSignIn();
  }

  /**
   * Waits for the password field, talking the page out of any other credential
   * it would rather use.
   *
   * Even with passkeys suppressed, an account can land on "Approve a request"
   * or on the credential picker; both offer a way back to the password, so the
   * recovery is: ask for the password directly, and if that link is not there,
   * open the list of other ways to sign in and ask from there.
   */
  private async ensurePasswordPrompt(): Promise<void> {
    const recoveries = [
      () => clickIfPresent(this.page, selectors.switchToPassword, 3_000),
      async () => {
        const opened = await clickIfPresent(this.page, selectors.switchToOtherCredential, 3_000);
        return opened && (await clickIfPresent(this.page, selectors.switchToPassword, 5_000));
      },
    ];

    for (const recover of [null, ...recoveries]) {
      if (await isAnyVisible(this.page, selectors.passwordInput, recover ? 5_000 : 10_000)) {
        return;
      }
      if (recover) {
        await recover();
      }
    }

    if (await isAnyVisible(this.page, selectors.passwordInput, 5_000)) {
      return;
    }
    throw new Error(await this.describeBlockingScreen('The password field never appeared.'));
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

  /**
   * Turns a stuck sign-in into a message that says what to do about it.
   *
   * The visible heading and the ids of the clickable elements are included
   * because the page may be in any language: the ids are what a maintainer can
   * actually act on.
   */
  private async describeBlockingScreen(prefix: string): Promise<string> {
    const details: string[] = [prefix];

    const error = await anyVisible(this.page, selectors.errorText)
      .textContent({ timeout: 2_000 })
      .catch(() => null);
    if (error?.trim()) {
      details.push(`Microsoft reported: "${error.trim()}"`);
    }

    const heading = await anyVisible(this.page, ['[role="heading"]', '#loginHeader', 'h1'])
      .textContent({ timeout: 2_000 })
      .catch(() => null);
    if (heading?.trim()) {
      details.push(`Screen heading: "${heading.trim()}"`);
    }

    const actions = await this.visibleActionIds();
    if (actions.length > 0) {
      details.push(`Clickable elements on screen: ${actions.join(', ')}`);
    }

    if (await isAnyVisible(this.page, selectors.interactionRequired, 2_000)) {
      details.push('The account is asking for a second factor or another one-off confirmation.');
    }

    details.push(
      'This suite signs in with an e-mail and a password only. If the account cannot ' +
        'do that - MFA, a passkey-only account, Conditional Access - run ' +
        '`npm run auth:manual` once to sign in by hand; the saved session is reused afterwards.',
      `Current URL: ${this.page.url()}`,
    );
    return details.join('\n');
  }

  private async visibleActionIds(): Promise<string[]> {
    return this.page
      .evaluate(() =>
        Array.from(document.querySelectorAll('a, button, input[type="submit"], [data-value]'))
          .filter((element) => (element as HTMLElement).offsetParent !== null)
          .map((element) => element.id || element.getAttribute('data-value') || '')
          .filter(Boolean)
          .slice(0, 15),
      )
      .catch(() => []);
  }
}
