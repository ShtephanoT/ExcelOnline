import type { Locator, Page } from '@playwright/test';
import { excelSelectors, gridCellCandidates } from './excel.selectors.js';
import { anyVisible, clickIfPresent, type LocatorRoot } from '../utils/locators.js';

export interface ExcelWorkbookPageOptions {
  newWorkbookUrl: string;
  appLoadTimeoutMs: number;
  actionTimeoutMs: number;
}

const OVERLAY_CLICK_TIMEOUT_MS = 5_000;
const GRID_FOCUS_TIMEOUT_MS = 10_000;
const READ_ATTEMPT_TIMEOUT_MS = 2_000;
const READ_POLL_INTERVAL_MS = 500;

export class ExcelWorkbookPage {
  private root: LocatorRoot;

  constructor(
    private readonly page: Page,
    private readonly options: ExcelWorkbookPageOptions,
  ) {
    this.root = page;
  }

  async openNewWorkbook(): Promise<void> {
    await this.page.goto(this.options.newWorkbookUrl, { waitUntil: 'domcontentloaded' });
    await this.waitForEditorReady();
  }

  async waitForEditorReady(): Promise<void> {
    await this.resolveAppRoot();
    await anyVisible(this.root, excelSelectors.nameBox).waitFor({
      state: 'visible',
      timeout: this.options.appLoadTimeoutMs,
    });
    await clickIfPresent(this.root, excelSelectors.dismissableOverlays, 2_000);
  }

  async selectCell(cellReference: string): Promise<void> {
    const nameBox = anyVisible(this.root, excelSelectors.nameBox);

    try {
      await nameBox.click({ timeout: OVERLAY_CLICK_TIMEOUT_MS });
    } catch {
      await this.page.keyboard.press('Escape');
      await nameBox.click({ timeout: OVERLAY_CLICK_TIMEOUT_MS });
    }

    await nameBox.fill(cellReference);
    await nameBox.press('Enter');
    await this.waitForGridFocus();
  }

  async enterFormula(cellReference: string, formula: string): Promise<void> {
    await this.selectCell(cellReference);
    await this.page.keyboard.type(formula, { delay: 30 });
    await this.page.keyboard.press('Enter');
  }

  async getFormula(cellReference: string): Promise<string> {
    await this.selectCell(cellReference);
    const formulaBar = anyVisible(this.root, excelSelectors.formulaBar);
    await formulaBar.waitFor({ state: 'visible', timeout: this.options.actionTimeoutMs });
    const text = (await formulaBar.innerText()) || (await formulaBar.inputValue().catch(() => ''));
    return text.trim();
  }

  async getDisplayedValue(cellReference: string): Promise<string> {
    await this.selectCell(cellReference);
    const deadline = Date.now() + this.options.actionTimeoutMs;

    for (;;) {
      const value =
        (await this.readFromClipboard()) ?? (await this.readFromAccessibilityLayer(cellReference));
      if (value !== null) {
        return value;
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `${cellReference} still reads as empty after ${this.options.actionTimeoutMs} ms - ` +
            'neither the clipboard nor the accessibility layer returned anything. ' +
            'See "Known limitations" in the README.',
        );
      }
      await this.page.waitForTimeout(READ_POLL_INTERVAL_MS);
    }
  }

  private async readFromClipboard(): Promise<string | null> {
    try {
      await this.page.keyboard.press('Control+C');
      const text = await this.page.evaluate(() => navigator.clipboard.readText());
      return text.trim() || null;
    } catch {
      return null;
    }
  }

  private async readFromAccessibilityLayer(cellReference: string): Promise<string | null> {
    const cell = anyVisible(this.root, gridCellCandidates(cellReference));
    try {
      await cell.waitFor({ state: 'visible', timeout: READ_ATTEMPT_TIMEOUT_MS });
      const label = (await cell.getAttribute('aria-label')) ?? (await cell.innerText());
      return label.replace(new RegExp(`^\\s*${cellReference}\\b[:\\s]*`, 'i'), '').trim() || null;
    } catch {
      return null;
    }
  }

  private async resolveAppRoot(): Promise<void> {
    const appFrame = anyVisible(this.page, excelSelectors.appFrame);
    const nameBoxInPage = anyVisible(this.page, excelSelectors.nameBox);

    const whenVisible = async (locator: Locator, root: () => LocatorRoot): Promise<LocatorRoot> => {
      await locator.waitFor({ state: 'visible', timeout: this.options.appLoadTimeoutMs });
      return root();
    };

    this.root = await Promise.any([
      whenVisible(appFrame, () => appFrame.contentFrame()),
      whenVisible(nameBoxInPage, () => this.page),
    ]).catch(() => {
      throw new Error(
        `Excel for the web did not load within ${this.options.appLoadTimeoutMs} ms: neither the ` +
          `app iframe nor the Name Box appeared at ${this.page.url()}.`,
      );
    });
  }

  private async waitForGridFocus(): Promise<void> {
    const focused = excelSelectors.gridKeyboardInput.map((s) => `${s}:focus`).join(', ');

    await this.root
      .locator(focused)
      .first()
      .waitFor({ state: 'attached', timeout: GRID_FOCUS_TIMEOUT_MS })
      .catch(() => {
        throw new Error(
          'The grid never took keyboard focus back after the Name Box, so a formula typed now ' +
            'would not reach the cell. Check `gridKeyboardInput` in src/pages/excel.selectors.ts.',
        );
      });
  }
}
