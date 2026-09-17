export const excelSelectors = {
  appFrame: ['iframe[name^="WacFrame"]', 'iframe#WebApplicationFrame', 'iframe[title*="Excel" i]'],

  nameBox: [
    'input[aria-label*="Name Box" i]',
    '#FormulaBar-NameBox-input',
    '#m_excelWebRenderer_ewaCtl_NameBox',
  ],

  formulaBar: [
    '[aria-label*="formula bar" i][role="textbox"]',
    '#formulaBarTextDiv',
    '#m_excelWebRenderer_ewaCtl_formulaBarTextBox',
  ],

  gridKeyboardInput: [
    '#gridKeyboardContentEditable_textElement',
    '.ewa-rteTextElement',
    '[contenteditable="true"].ql-editor',
  ],

  dismissableOverlays: [
    '[data-automationid="TeachingBubbleClose"]',
    '[role="dialog"] button[aria-label*="Close" i]',
    'button[aria-label*="Dismiss" i]',
  ],
} as const;

export function gridCellCandidates(cellReference: string): string[] {
  return [
    `[role="gridcell"][aria-label^="${cellReference} " i]`,
    `[role="gridcell"][aria-label="${cellReference}" i]`,
    `[role="gridcell"][id$="${cellReference}" i]`,
  ];
}
