import type { Page } from '@playwright/test';
import { excelSelectors, gridCellCandidates } from './excel.selectors.js';
import { anyVisible, clickIfPresent, isAnyVisible, type LocatorRoot } from '../utils/locators.js';

export interface ExcelWorkbookPageOptions {
  newWorkbookUrl: string;
  appLoadTimeoutMs: number;
  actionTimeoutMs: number;
}

/**
 * Page object for a workbook open in Excel for the web.
 *
 * Two things about this app shape the design:
 *
 *  - The editor is usually hosted in a WAC iframe, so every locator is rooted at
 *    {@link root} rather than at the page.
 *  - The grid is painted on a canvas. There is an accessibility layer over it,
 *    but its markup is neither documented nor stable, so the *value* of a cell is
 *    read by copying it to the clipboard - which is plain, first-class Excel
 *    behaviour - and the accessibility layer is only the fallback.
 */
export class ExcelWorkbookPage {
  /** Where the Excel UI actually lives: the WAC iframe, or the page itself. */
  private root: LocatorRoot;

  constructor(
    private readonly page: Page,
    private readonly options: ExcelWorkbookPageOptions,
  ) {
    this.root = page;
  }

  /** Creates a new blank workbook and waits until the grid accepts input. */
  async openNewWorkbook(): Promise<void> {
    await this.page.goto(this.options.newWorkbookUrl, { waitUntil: 'domcontentloaded' });
    await this.waitForEditorReady();
  }

  /**
   * Locates the app (iframe or page) and waits until the editor is interactive.
   * Exposed separately because the sign-in step lands in the editor too and uses
   * this as its proof that the account really can open Excel for the web.
   */
  async waitForEditorReady(): Promise<void> {
    await this.resolveAppRoot();
    await this.waitUntilReady();
    await this.dismissStartupOverlays();
  }

  /** Selects a cell through the Name Box - independent of scroll position and zoom. */
  async selectCell(cellReference: string): Promise<void> {
    const nameBox = anyVisible(this.root, excelSelectors.nameBox);
    await nameBox.click({ timeout: this.options.actionTimeoutMs });
    await nameBox.fill(cellReference);
    await nameBox.press('Enter');
    // The grid takes focus back; without this the following keystrokes can be lost.
    await this.page.waitForTimeout(250);
  }

  /** Types a formula into a cell and commits it with Enter. */
  async enterFormula(cellReference: string, formula: string): Promise<void> {
    await this.selectCell(cellReference);
    await this.page.keyboard.type(formula, { delay: 30 });
    await this.page.keyboard.press('Enter');
    await this.waitForCalculationToSettle();
  }

  /** The formula stored in a cell, as shown by the formula bar (e.g. "=TODAY()"). */
  async getFormula(cellReference: string): Promise<string> {
    await this.selectCell(cellReference);
    const formulaBar = anyVisible(this.root, excelSelectors.formulaBar);
    await formulaBar.waitFor({ state: 'visible', timeout: this.options.actionTimeoutMs });
    const text = (await formulaBar.innerText()) || (await formulaBar.inputValue().catch(() => ''));
    return text.trim();
  }

  /**
   * The text Excel renders in a cell - the formula's *result*, formatted with the
   * workbook's locale and number format.
   */
  async getDisplayedValue(cellReference: string): Promise<string> {
    await this.selectCell(cellReference);

    const value =
      (await this.readSelectedCellFromClipboard()) ??
      (await this.readCellFromAccessibilityLayer(cellReference));

    if (value === null) {
      throw new Error(
        `Could not read the displayed value of ${cellReference}. ` +
          'Neither the clipboard nor the accessibility layer returned anything - ' +
          'see "Known limitations" in the README.',
      );
    }
    return value;
  }

  /** Ctrl+C on the selected cell, then read the system clipboard. */
  private async readSelectedCellFromClipboard(): Promise<string | null> {
    try {
      await this.page.keyboard.press('Control+C');
      const text = await this.page.evaluate(() => navigator.clipboard.readText());
      const trimmed = text.replace(/[\r\n\t]+$/, '').trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch {
      return null; // Clipboard access is a nice-to-have; fall through to the DOM.
    }
  }

  /** Fallback: read the cell's accessible name from the layer over the canvas. */
  private async readCellFromAccessibilityLayer(cellReference: string): Promise<string | null> {
    const cell = anyVisible(this.root, gridCellCandidates(cellReference));
    try {
      await cell.waitFor({ state: 'visible', timeout: 5_000 });
      const label = (await cell.getAttribute('aria-label')) ?? (await cell.innerText());
      // Accessible names are usually "<reference> <value>"; drop the reference.
      const value = label.replace(new RegExp(`^\\s*${cellReference}\\b[:\\s]*`, 'i'), '').trim();
      return value.length > 0 ? value : null;
    } catch {
      return null;
    }
  }

  /** Office web apps render inside an iframe in most entry points, but not all. */
  private async resolveAppRoot(): Promise<void> {
    const frameIsPresent = await isAnyVisible(
      this.page,
      excelSelectors.appFrame,
      this.options.appLoadTimeoutMs / 3,
    );
    this.root = frameIsPresent
      ? this.page.frameLocator(excelSelectors.appFrame.join(', '))
      : this.page;
  }

  /** The Name Box appearing is the earliest reliable "the editor is interactive" signal. */
  private async waitUntilReady(): Promise<void> {
    await anyVisible(this.root, [...excelSelectors.nameBox, ...excelSelectors.grid]).waitFor({
      state: 'visible',
      timeout: this.options.appLoadTimeoutMs,
    });
    await anyVisible(this.root, excelSelectors.nameBox).waitFor({
      state: 'visible',
      timeout: this.options.appLoadTimeoutMs,
    });
  }

  private async dismissStartupOverlays(): Promise<void> {
    await clickIfPresent(this.root, excelSelectors.dismissableOverlays, 2_000);
  }

  /**
   * Excel for the web recalculates on the server, so the committed value arrives
   * asynchronously. Waiting for the network to go quiet is cheap insurance and is
   * capped so a chatty telemetry connection cannot hang the test.
   */
  private async waitForCalculationToSettle(): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {
      /* Excel keeps long-poll connections open; a timeout here is not a failure. */
    });
  }
}
