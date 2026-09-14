/**
 * Every CSS selector that points at Excel for the web lives here.
 *
 * Keeping them in one file is deliberate: the app has no stable automation
 * hooks, so selectors are the part of this suite most likely to need
 * maintenance after a Microsoft release. Each entry lists several candidates -
 * ARIA-based ones first (they survive refactors best), internal ids after.
 */
export const excelSelectors = {
  /** The Office web apps are usually hosted inside a WAC iframe. */
  appFrame: [
    'iframe[name^="WacFrame"]',
    'iframe#WebApplicationFrame',
    'iframe[name="sdx_ow_iframe"]',
    'iframe[title*="Excel" i]',
  ],

  /** Name Box - typing "A2" + Enter is the most reliable way to select a cell. */
  nameBox: [
    'input[aria-label*="Name Box" i]',
    'input[aria-label*="Name box" i]',
    '#m_excelWebRenderer_ewaCtl_NameBox',
    '#FormulaBar-NameBox-input',
    'input[name="NameBox"]',
  ],

  /** Formula bar - shows the formula of the selected cell, not its value. */
  formulaBar: [
    '[aria-label*="formula bar" i][role="textbox"]',
    '[aria-label*="Formula Bar" i] [role="textbox"]',
    '#formulaBarTextDiv',
    '#m_excelWebRenderer_ewaCtl_formulaBarTextBox',
  ],

  /** The spreadsheet canvas / grid, used as the "app is interactive" signal. */
  grid: [
    '[role="grid"]',
    '#m_excelWebRenderer_ewaCtl_sheetContentDiv',
    '.ewa-grid',
    'canvas.gridCanvas',
  ],

  /** First-run teaching bubbles, "what's new" cards and similar noise. */
  dismissableOverlays: [
    '[data-automationid="TeachingBubbleClose"]',
    '[role="dialog"] button[aria-label*="Close" i]',
    'button[aria-label*="Close dialog" i]',
    'button[aria-label*="Dismiss" i]',
  ],
} as const;

/** Builds the accessibility-tree selector for a single cell, e.g. "A2". */
export function gridCellCandidates(cellReference: string): string[] {
  return [
    `[role="gridcell"][aria-label^="${cellReference} " i]`,
    `[role="gridcell"][aria-label="${cellReference}" i]`,
    `[role="gridcell"][id$="${cellReference}" i]`,
    `[aria-label^="${cellReference} " i][role="cell"]`,
  ];
}
