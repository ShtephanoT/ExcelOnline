import type { FrameLocator, Locator, Page } from '@playwright/test';

export type LocatorRoot = Page | FrameLocator;

export function anyVisible(root: LocatorRoot, candidates: readonly string[]): Locator {
  return root.locator(candidates.map((candidate) => `${candidate}:visible`).join(', ')).first();
}

export function isAnyVisible(
  root: LocatorRoot,
  candidates: readonly string[],
  timeoutMs: number,
): Promise<boolean> {
  return anyVisible(root, candidates)
    .waitFor({ state: 'visible', timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);
}

export function clickIfPresent(
  root: LocatorRoot,
  candidates: readonly string[],
  timeoutMs: number,
): Promise<boolean> {
  return anyVisible(root, candidates)
    .click({ timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);
}
