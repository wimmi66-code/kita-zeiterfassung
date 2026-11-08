// Datumsfunktionen auf Basis von ISO-Strings "YYYY-MM-DD".
// Gerechnet wird in UTC, damit Sommerzeit und Zeitzone keine Rolle spielen.

export type IsoDate = string;

export function toIso(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function fromIso(s: IsoDate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function makeDate(year: number, month: number, day: number): IsoDate {
  return toIso(new Date(Date.UTC(year, month - 1, day)));
}

export function addDays(s: IsoDate, n: number): IsoDate {
  const d = fromIso(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

/** Differenz in Tagen (b − a). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((fromIso(b).getTime() - fromIso(a).getTime()) / 86_400_000);
}

/** ISO-Wochentag: 1 = Montag … 7 = Sonntag */
export function isoWeekday(s: IsoDate): number {
  const wd = fromIso(s).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthDays(year: number, month: number): IsoDate[] {
  const n = daysInMonth(year, month);
  return Array.from({ length: n }, (_, i) => makeDate(year, month, i + 1));
}

export function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export function weekdayShort(s: IsoDate): string {
  return WOCHENTAGE[isoWeekday(s) - 1];
}

export const MONATE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

export function formatDe(s: IsoDate): string {
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y}`;
}
