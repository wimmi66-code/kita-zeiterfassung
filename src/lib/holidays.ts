// Gesetzliche Feiertage Nordrhein-Westfalen
import { addDays, makeDate, type IsoDate } from './dates';

/** Ostersonntag nach der Gaußschen Osterformel (gregorianischer Kalender). */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return makeDate(year, month, day);
}

export interface Holiday {
  date: IsoDate;
  name: string;
}

const cache = new Map<number, Holiday[]>();

export function nrwHolidays(year: number): Holiday[] {
  const hit = cache.get(year);
  if (hit) return hit;
  const easter = easterSunday(year);
  const list: Holiday[] = [
    { date: makeDate(year, 1, 1), name: 'Neujahr' },
    { date: addDays(easter, -2), name: 'Karfreitag' },
    { date: addDays(easter, 1), name: 'Ostermontag' },
    { date: makeDate(year, 5, 1), name: 'Tag der Arbeit' },
    { date: addDays(easter, 39), name: 'Christi Himmelfahrt' },
    { date: addDays(easter, 50), name: 'Pfingstmontag' },
    { date: addDays(easter, 60), name: 'Fronleichnam' },
    { date: makeDate(year, 10, 3), name: 'Tag der Deutschen Einheit' },
    { date: makeDate(year, 11, 1), name: 'Allerheiligen' },
    { date: makeDate(year, 12, 25), name: '1. Weihnachtstag' },
    { date: makeDate(year, 12, 26), name: '2. Weihnachtstag' },
  ].sort((x, y) => x.date.localeCompare(y.date));
  cache.set(year, list);
  return list;
}

export function holidayName(date: IsoDate): string | null {
  const year = Number(date.slice(0, 4));
  return nrwHolidays(year).find((h) => h.date === date)?.name ?? null;
}

export function isHoliday(date: IsoDate): boolean {
  return holidayName(date) !== null;
}
