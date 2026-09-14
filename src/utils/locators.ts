import type { FrameLocator, Locator, Page } from '@playwright/test';

/**
 * Anything a locator can be rooted at: the page itself, or the iframe the
 * Office web app is hosted in.
 */
export type LocatorRoot = Page | FrameLocator;

/**
 * Turns a list of candidate CSS selectors into a single visible-only selector.
 *
 * Microsoft ships UI changes to Excel for the web continuously and the markup
 * carries no stable test ids, so every element is addressed through several
 * candidates at once: Playwright's built-in waiting then resolves whichever one
 * this particular build of the app happens to render.
 */
export function anyVisible(root: LocatorRoot, candidates: readonly string[]): Locator {
  if (candidates.length === 0) {
    throw new Error('anyVisible() needs at least one candidate selector');
  }
  return root.locator(candidates.map((candidate) => `${candidate}:visible`).join(', ')).first();
}

/** True when at least one of the candidates is on screen within `timeoutMs`. */
export async function isAnyVisible(
  root: LocatorRoot,
  candidates: readonly string[],
  timeoutMs: number,
): Promise<boolean> {
  return anyVisible(root, candidates)
    .waitFor({ state: 'visible', timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);
}

/** Clicks an element if it happens to be there; never fails the test if it is not. */
export async function clickIfPresent(
  root: LocatorRoot,
  candidates: readonly string[],
  timeoutMs: number,
): Promise<boolean> {
  const target = anyVisible(root, candidates);
  try {
    await target.click({ timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}
