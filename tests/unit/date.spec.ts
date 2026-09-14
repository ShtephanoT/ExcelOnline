import { expect, test } from '@playwright/test';
import {
  addDays,
  expectedDates,
  parseDisplayedDate,
  todayInTimeZone,
} from '../../src/utils/date.js';

/**
 * The date logic is the only part of the suite with real branching, so it is
 * tested on its own: these run in a second, without a browser or an MS account,
 * and they are what makes the e2e assertion trustworthy.
 */
test.describe('todayInTimeZone()', () => {
  const instant = new Date('2026-09-14T23:30:00Z');

  test('formats as ISO in the requested zone', () => {
    expect(todayInTimeZone('UTC', instant)).toBe('2026-09-14');
  });

  test('rolls over where the local day is already tomorrow', () => {
    expect(todayInTimeZone('Europe/Helsinki', instant)).toBe('2026-09-15');
  });

  test('stays on the previous day west of UTC', () => {
    expect(todayInTimeZone('America/Los_Angeles', instant)).toBe('2026-09-14');
  });
});

test.describe('expectedDates()', () => {
  const instant = new Date('2026-09-14T23:30:00Z');

  test('accepts both the pinned zone and UTC', () => {
    expect(expectedDates({ timeZone: 'Europe/Helsinki', instant })).toEqual([
      '2026-09-14',
      '2026-09-15',
    ]);
  });

  test('collapses to a single date when the zone matches UTC', () => {
    expect(expectedDates({ timeZone: 'UTC', instant })).toEqual(['2026-09-14']);
  });

  test('widens by a day either side when midnight tolerance is on', () => {
    expect(expectedDates({ timeZone: 'UTC', instant, allowMidnightTolerance: true })).toEqual([
      '2026-09-13',
      '2026-09-14',
      '2026-09-15',
    ]);
  });
});

test.describe('parseDisplayedDate()', () => {
  test('reads the US format Excel uses with en-US', () => {
    expect(parseDisplayedDate('9/14/2026')).toEqual(['2026-09-14']);
  });

  test('keeps both readings while the day/month order is ambiguous', () => {
    expect(parseDisplayedDate('09/08/2026')).toEqual(['2026-08-09', '2026-09-08']);
  });

  test('reads European separators', () => {
    expect(parseDisplayedDate('14.09.2026')).toEqual(['2026-09-14']);
    expect(parseDisplayedDate('14-09-2026')).toEqual(['2026-09-14']);
  });

  test('reads ISO order', () => {
    expect(parseDisplayedDate('2026-09-14')).toEqual(['2026-09-14']);
  });

  test('reads month names, long and short, in any position', () => {
    expect(parseDisplayedDate('14-Sep-2026')).toEqual(['2026-09-14']);
    expect(parseDisplayedDate('September 14, 2026')).toEqual(['2026-09-14']);
    expect(parseDisplayedDate('14 september 2026')).toEqual(['2026-09-14']);
  });

  test("expands two-digit years with Excel's 1930 pivot", () => {
    expect(parseDisplayedDate('9/14/26')).toEqual(['2026-09-14']);
    expect(parseDisplayedDate('9/14/86')).toEqual(['1986-09-14']);
  });

  test('rejects impossible calendar dates', () => {
    expect(parseDisplayedDate('02/30/2026')).toEqual([]);
    expect(parseDisplayedDate('13/13/2026')).toEqual([]);
  });

  test('rejects things that are not dates', () => {
    for (const text of ['', '#####', '#NAME?', 'TODAY()', '46280', 'not a date at all']) {
      expect(parseDisplayedDate(text), `"${text}" must not parse as a date`).toEqual([]);
    }
  });
});

test.describe('addDays()', () => {
  test('crosses month and year boundaries', () => {
    expect(addDays('2026-09-14', 1)).toBe('2026-09-15');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  test('rejects input that is not an ISO date', () => {
    expect(() => addDays('14/09/2026', 1)).toThrow(/Not an ISO date/);
  });
});
