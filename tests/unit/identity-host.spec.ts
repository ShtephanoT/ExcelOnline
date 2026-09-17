import { expect, test } from '@playwright/test';
import { isIdentityProviderHost } from '../../src/pages/microsoft-login.page.js';

test.describe('isIdentityProviderHost()', () => {
  test('recognises the work-and-school sign-in host', () => {
    expect(isIdentityProviderHost('login.microsoftonline.com')).toBe(true);
  });

  test('recognises the consumer sign-in host a personal account is handed to', () => {
    expect(isIdentityProviderHost('login.live.com')).toBe(true);
    expect(isIdentityProviderHost('account.live.com')).toBe(true);
  });

  test('recognises subdomains of a sign-in host', () => {
    expect(isIdentityProviderHost('eu.login.microsoftonline.com')).toBe(true);
  });

  test('does not mistake the app itself for the sign-in', () => {
    expect(isIdentityProviderHost('excel.cloud.microsoft')).toBe(false);
    expect(isIdentityProviderHost('excel.officeapps.live.com')).toBe(false);
    expect(isIdentityProviderHost('www.office.com')).toBe(false);
  });

  test('matches on a label boundary, not a bare suffix', () => {
    expect(isIdentityProviderHost('notlogin.live.com')).toBe(false);
    expect(isIdentityProviderHost('login.live.com.example.net')).toBe(false);
  });
});
