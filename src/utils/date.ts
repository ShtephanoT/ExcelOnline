export type IsoDate = string;

export function todayInTimeZone(timeZone: string, instant = new Date()): IsoDate {
  return new Intl.DateTimeFormat('sv-SE', { timeZone }).format(instant);
}

export function expectedDates(options: {
  timeZone: string;
  allowMidnightTolerance?: boolean;
  instant?: Date;
}): IsoDate[] {
  const { timeZone, allowMidnightTolerance = false, instant = new Date() } = options;
  const accepted = new Set<IsoDate>();

  for (const anchor of [todayInTimeZone(timeZone, instant), todayInTimeZone('UTC', instant)]) {
    accepted.add(anchor);
    if (allowMidnightTolerance) {
      accepted.add(addDays(anchor, -1));
      accepted.add(addDays(anchor, 1));
    }
  }
  return [...accepted].sort();
}

export function matchesExpectedDate(displayed: string, accepted: readonly IsoDate[]): boolean {
  return parseDisplayedDate(displayed).some((candidate) => accepted.includes(candidate));
}

export function parseDisplayedDate(displayed: string): IsoDate[] {
  const [first, second, third, ...rest] = displayed
    .trim()
    .split(/[\s,./-]+/)
    .filter(Boolean);
  if (!first || !second || !third || rest.length > 0) {
    return [];
  }

  const readings: [string, string, string][] =
    first.length === 4
      ? [[first, second, third]]
      : [
          [third, first, second],
          [third, second, first],
        ];

  const dates = readings.map(toIsoDate).filter((date) => date !== null);
  return [...new Set(dates)].sort();
}

function toIsoDate([year, month, day]: [string, string, string]): IsoDate | null {
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return null;
  }
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || !date.toISOString().startsWith(iso) ? null : iso;
}

function addDays(isoDate: IsoDate, days: number): IsoDate {
  const shifted = new Date(`${isoDate}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}
