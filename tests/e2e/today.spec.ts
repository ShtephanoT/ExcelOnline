import { expect, test } from '@playwright/test';
import { appConfig } from '../../src/config/env.js';
import { ExcelWorkbookPage } from '../../src/pages/excel-workbook.page.js';
import { expectedDates, matchesExpectedDate, parseDisplayedDate } from '../../src/utils/date.js';

const FORMULA = '=TODAY()';
const CELL = appConfig.targetCell;

test(`${FORMULA} in ${CELL} returns the date the test is performed`, async ({ page }) => {
  const accepted = expectedDates({
    timeZone: appConfig.timezoneId,
    allowMidnightTolerance: appConfig.allowMidnightTolerance,
  });
  const workbook = new ExcelWorkbookPage(page, appConfig);

  await test.step('create a new blank workbook', () => workbook.openNewWorkbook());
  await test.step(`enter ${FORMULA} in ${CELL}`, () => workbook.enterFormula(CELL, FORMULA));

  await test.step('the formula is stored in the cell', async () => {
    const stored = await workbook.getFormula(CELL);
    expect.soft(stored.replace(/\s+/g, ''), `formula bar for ${CELL}`).toBe(FORMULA);
  });

  await test.step('the returned value is today', async () => {
    const displayed = await workbook.getDisplayedValue(CELL);
    const parsed = parseDisplayedDate(displayed);

    test.info().annotations.push({
      type: `${CELL} displayed`,
      description: `"${displayed}" -> ${parsed.join(' or ') || 'not a date'}; accepted: ${accepted.join(', ')}`,
    });

    expect(parsed, `${CELL} displays "${displayed}", which is not a date at all`).not.toHaveLength(
      0,
    );
    expect(
      matchesExpectedDate(displayed, accepted),
      `${CELL} displays "${displayed}", expected one of ${accepted.join(', ')} ` +
        `(time zone ${appConfig.timezoneId})`,
    ).toBe(true);
  });
});
