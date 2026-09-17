import { expect, test } from '@playwright/test';
import {
  expectedDates,
  matchesExpectedDate,
  parseDisplayedDate,
  todayInTimeZone,
} from '../../src/utils/date.js';

const INSTANT = new Date('2026-09-14T23:30:00Z');

test.describe('todayInTimeZone()', () => {
  test('formats as ISO in the requested zone', () => {
    expect(todayInTimeZone('UTC', INSTANT)).toBe('2026-09-14');
  });

  test('rolls over where the local day is already tomorrow', () => {
    expect(todayInTimeZone('Europe/Helsinki', INSTANT)).toBe('2026-09-15');
  });

  test('stays on the previous day west of UTC', () => {
    expect(todayInTimeZone('America/Los_Angeles', INSTANT)).toBe('2026-09-14');
  });
});

test.describe('expectedDates()', () => {
  test('accepts both the pinned zone and UTC', () => {
    expect(expectedDates({ timeZone: 'Europe/Helsinki', instant: INSTANT })).toEqual([
      '2026-09-14',
      '2026-09-15',
    ]);
  });

  test('collapses to a single date when the zone matches UTC', () => {
    expect(expectedDates({ timeZone: 'UTC', instant: INSTANT })).toEqual(['2026-09-14']);
  });

  test('widens by a day either side when midnight tolerance is on', () => {
    expect(
      expectedDates({ timeZone: 'UTC', instant: INSTANT, allowMidnightTolerance: true }),
    ).toEqual(['2026-09-13', '2026-09-14', '2026-09-15']);
  });
});

test.describe('parseDisplayedDate()', () => {
  test('reads the US format Excel uses with en-US', () => {
    expect(parseDisplayedDate('9/14/2026')).toEqual(['2026-09-14']);
  });

  test('keeps both readings while the day/month order is ambiguous', () => {
    expect(parseDisplayedDate('09/08/2026')).toEqual(['2026-08-09', '2026-09-08']);
  });

  test('reads other separators and ISO order', () => {
    expect(parseDisplayedDate('14.09.2026')).toEqual(['2026-09-14']);
    expect(parseDisplayedDate('14-09-2026')).toEqual(['2026-09-14']);
    expect(parseDisplayedDate('2026-09-14')).toEqual(['2026-09-14']);
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

test.describe('matchesExpectedDate()', () => {
  const accepted = ['2026-09-17'];

  test('accepts the date the run expects', () => {
    expect(matchesExpectedDate('9/17/2026', accepted)).toBe(true);
  });

  test('rejects a real date that is the wrong day', () => {
    expect(matchesExpectedDate('9/10/2026', accepted)).toBe(false);
    expect(matchesExpectedDate('9/18/2026', accepted)).toBe(false);
    expect(matchesExpectedDate('9/17/2025', accepted)).toBe(false);
  });

  test('rejects text that is not a date', () => {
    expect(matchesExpectedDate('#####', accepted)).toBe(false);
    expect(matchesExpectedDate('', accepted)).toBe(false);
  });

  test('accepts an ambiguous rendering when either reading matches', () => {
    expect(matchesExpectedDate('09/08/2026', ['2026-08-09'])).toBe(true);
    expect(matchesExpectedDate('09/08/2026', ['2026-09-08'])).toBe(true);
    expect(matchesExpectedDate('09/08/2026', ['2026-09-07'])).toBe(false);
  });
});
