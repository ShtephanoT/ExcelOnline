/**
 * Date helpers for the TODAY() assertion.
 *
 * Two problems are solved here, and both are pure functions so they can be
 * unit-tested without a browser:
 *
 *  1. What *is* "today"?  The browser clock, the runner clock and the Microsoft
 *     service clock do not have to agree, so we build a small set of acceptable
 *     answers instead of a single one.
 *  2. What did Excel actually render?  A date cell is displayed in the
 *     workbook's locale ("9/14/2026", "14.09.2026", "14-Sep-2026", ...), so the
 *     displayed text is normalised to ISO before comparing.
 */

/** A calendar date in `YYYY-MM-DD` form - the canonical currency of this module. */
export type IsoDate = string;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Excel's two-digit-year rule: 00-29 -> 2000s, 30-99 -> 1900s. */
const TWO_DIGIT_YEAR_PIVOT = 30;

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

/** The calendar date at `instant` as observed in `timeZone`. */
export function todayInTimeZone(timeZone: string, instant: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';

  return `${part('year')}-${part('month')}-${part('day')}`;
}

export interface ExpectedDatesOptions {
  /** Time zone the browser is pinned to (see `TIMEZONE_ID`). */
  timeZone: string;
  /** Also accept yesterday and tomorrow, for clock skew around midnight. */
  allowMidnightTolerance?: boolean;
  /** Injectable clock - keeps the unit tests deterministic. */
  instant?: Date;
}

/**
 * Every date the test is willing to accept as "the date the test is performed".
 *
 * UTC is always included: Excel for the web recalculates server-side, and the
 * service does not necessarily share the browser's time zone.
 */
export function expectedDates({
  timeZone,
  allowMidnightTolerance = false,
  instant = new Date(),
}: ExpectedDatesOptions): IsoDate[] {
  const anchors = [todayInTimeZone(timeZone, instant), todayInTimeZone('UTC', instant)];

  const accepted = new Set<IsoDate>();
  for (const anchor of anchors) {
    accepted.add(anchor);
    if (allowMidnightTolerance) {
      accepted.add(addDays(anchor, -1));
      accepted.add(addDays(anchor, 1));
    }
  }
  return [...accepted].sort();
}

/** Shifts an ISO date by whole days. */
export function addDays(isoDate: IsoDate, days: number): IsoDate {
  if (!ISO_DATE_PATTERN.test(isoDate)) {
    throw new Error(`Not an ISO date: "${isoDate}"`);
  }
  const shifted = new Date(`${isoDate}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Normalises the text Excel rendered into every ISO date it could plausibly mean.
 *
 * More than one reading is returned on purpose: "09/08/2026" is the 9th of August
 * in most of Europe and the 8th of September in the US, and the test should not
 * fail merely because the workbook locale is not the one we guessed. A date that
 * is *wrong* is wrong under either reading, so the assertion stays meaningful.
 *
 * Returns an empty array when the text is not a date at all (`#####`, `#NAME?`,
 * an empty cell, ...), which the caller reports as a failure.
 */
export function parseDisplayedDate(displayed: string): IsoDate[] {
  const tokens = displayed
    .trim()
    .toLowerCase()
    .split(/[\s,./-]+/)
    .filter(Boolean);

  if (tokens.length !== 3) {
    return [];
  }

  const candidates = tokens.some(isAlphabetic)
    ? candidatesWithMonthName(tokens)
    : numericCandidates(tokens);

  return [...new Set(candidates.filter((date): date is IsoDate => date !== null))].sort();
}

/** True when `displayed` renders to one of the `accepted` dates. */
export function matchesAnyExpectedDate(displayed: string, accepted: readonly IsoDate[]): boolean {
  return parseDisplayedDate(displayed).some((candidate) => accepted.includes(candidate));
}

function candidatesWithMonthName(tokens: string[]): (IsoDate | null)[] {
  const monthToken = tokens.find(isAlphabetic) as string;
  const month = monthFromName(monthToken);
  const [first, second] = tokens.filter((token) => token !== monthToken);
  if (month === null || first === undefined || second === undefined) {
    return [];
  }

  // The four-digit token is the year; otherwise the trailing one is ("14 Sep 26").
  const [year, day] = first.length === 4 ? [first, second] : [second, first];
  return [buildIsoDate(year, String(month), day)];
}

function numericCandidates(tokens: string[]): (IsoDate | null)[] {
  const [first, second, third] = tokens as [string, string, string];

  if (first.length === 4) {
    return [buildIsoDate(first, second, third)]; // ISO-ish: 2026-09-14
  }
  return [
    buildIsoDate(third, first, second), // US: month/day/year
    buildIsoDate(third, second, first), // rest of the world: day/month/year
  ];
}

function monthFromName(token: string): number | null {
  const index = MONTH_NAMES.findIndex(
    (name) => name === token || (token.length >= 3 && name.startsWith(token)),
  );
  return index === -1 ? null : index + 1;
}

/** Builds an ISO date, rejecting anything the calendar does not contain (e.g. 31 Feb). */
function buildIsoDate(year: string, month: string, day: string): IsoDate | null {
  if (![year, month, day].every((part) => /^\d{1,4}$/.test(part))) {
    return null;
  }

  const fullYear = expandYear(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (fullYear === null || monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) {
    return null;
  }

  const date = new Date(Date.UTC(fullYear, monthNumber - 1, dayNumber));
  const isReal =
    date.getUTCFullYear() === fullYear &&
    date.getUTCMonth() === monthNumber - 1 &&
    date.getUTCDate() === dayNumber;

  return isReal ? date.toISOString().slice(0, 10) : null;
}

function expandYear(year: string): number | null {
  const value = Number(year);
  if (year.length === 4) {
    return value;
  }
  if (year.length <= 2) {
    return value < TWO_DIGIT_YEAR_PIVOT ? 2000 + value : 1900 + value;
  }
  return null; // three-digit years are not a thing Excel renders
}

function isAlphabetic(token: string): boolean {
  return /^[a-z]+$/.test(token);
}
