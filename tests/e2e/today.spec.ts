import { expect, test } from '@playwright/test';
import { appConfig } from '../../src/config/env.js';
import { ExcelWorkbookPage } from '../../src/pages/excel-workbook.page.js';
import { expectedDates, parseDisplayedDate } from '../../src/utils/date.js';

const FORMULA = '=TODAY()';

test.describe('Excel for the web - TODAY()', () => {
  test(`${FORMULA} in ${appConfig.targetCell} returns the date the test is performed`, async ({
    page,
  }) => {
    // Captured before the browser work starts, so a long-running test still
    // compares against the day the run began.
    const acceptedDates = expectedDates({
      timeZone: appConfig.timezoneId,
      allowMidnightTolerance: appConfig.allowMidnightTolerance,
    });

    const workbook = new ExcelWorkbookPage(page, appConfig);

    await test.step('create a new blank workbook', async () => {
      await workbook.openNewWorkbook();
    });

    await test.step(`enter ${FORMULA} in ${appConfig.targetCell}`, async () => {
      await workbook.enterFormula(appConfig.targetCell, FORMULA);
    });

    await test.step('the formula is stored in the cell', async () => {
      const storedFormula = await workbook.getFormula(appConfig.targetCell);
      // Soft, so a formula-bar rendering quirk still lets the real check below run.
      expect
        .soft(storedFormula.replace(/\s+/g, ''), `formula bar content for ${appConfig.targetCell}`)
        .toBe(FORMULA);
    });

    await test.step('the returned value is today', async () => {
      const displayed = await workbook.getDisplayedValue(appConfig.targetCell);
      const parsed = parseDisplayedDate(displayed);

      expect(
        parsed,
        `${appConfig.targetCell} displays "${displayed}", which is not a date at all`,
      ).not.toHaveLength(0);

      expect(
        parsed.some((candidate) => acceptedDates.includes(candidate)),
        `${appConfig.targetCell} displays "${displayed}" (read as ${parsed.join(' or ')}), ` +
          `expected one of ${acceptedDates.join(', ')} ` +
          `(time zone ${appConfig.timezoneId})`,
      ).toBe(true);
    });
  });
});
