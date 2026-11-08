// Freigabefrist: n-ter Werktag des Folgemonats (Werktag = Mo–Fr ohne Feiertage NRW)
import { addDays, diffDays, isoWeekday, makeDate, nextMonth, type IsoDate } from './dates';
import { isHoliday } from './holidays';

export function isWorkday(d: IsoDate): boolean {
  return isoWeekday(d) <= 5 && !isHoliday(d);
}

export function nthWorkday(year: number, month: number, n: number): IsoDate {
  if (n < 1) throw new Error('n muss mindestens 1 sein');
  let d = makeDate(year, month, 1);
  let count = 0;
  for (;;) {
    if (isWorkday(d)) {
      count += 1;
      if (count === n) return d;
    }
    d = addDays(d, 1);
  }
}

/** Frist für die Freigabe des Monats (year, month). */
export function releaseDeadline(year: number, month: number, nthDay = 5): IsoDate {
  const nm = nextMonth(year, month);
  return nthWorkday(nm.year, nm.month, nthDay);
}

export type DeadlineState = 'erledigt' | 'ok' | 'bald' | 'ueberfaellig';

/**
 * Ampel für das Dashboard. "bald" = Frist in höchstens 2 Tagen.
 * Überfällig ist ein Monat, der nach Ablauf der Frist noch nicht freigegeben ist.
 */
export function deadlineState(deadline: IsoDate, today: IsoDate, released: boolean): DeadlineState {
  if (released) return 'erledigt';
  const left = diffDays(today, deadline);
  if (left < 0) return 'ueberfaellig';
  if (left <= 2) return 'bald';
  return 'ok';
}
