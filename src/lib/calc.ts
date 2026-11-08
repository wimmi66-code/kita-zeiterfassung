// Ist, Soll, Differenz je Tag, Monat und Jahr; Urlaubskonto
import { computeBreak } from './breaks';
import { makeDate, monthDays, type IsoDate } from './dates';
import type { EmploymentTerms, ScheduleDay, TimeEntry, YearBalance } from './types';
import { termsFor } from './schedule';

export interface DayResult {
  day: IsoDate;
  entry: TimeEntry | null;
  plan: number;
  soll: number;
  ist: number;
  diff: number;
  breakDeducted: number;
  autoBreak: number;
  isHoliday: boolean;
  /** Geplanter Arbeitstag in der Vergangenheit ohne Eintrag */
  missing: boolean;
}

const hasTimes = (e: TimeEntry) => !!(e.start1 && e.end1) || !!(e.start2 && e.end2);

export function computeDay(
  day: IsoDate,
  schedule: ScheduleDay | undefined,
  entry: TimeEntry | undefined,
  today: IsoDate,
): DayResult {
  const plan = schedule?.plan_minutes ?? 0;
  const isHoliday = schedule?.is_holiday ?? false;
  const e = entry ?? null;

  let soll = plan;
  if (isHoliday || e?.day_type === 'feiertag') soll = 0;
  else if (e?.day_type === 'halber_urlaub') soll = Math.round(plan / 2);

  let ist = 0;
  let breakDeducted = 0;
  let autoBreak = 0;
  if (e && hasTimes(e)) {
    const b = computeBreak(e, e.break_minutes);
    ist = b.net;
    breakDeducted = b.deducted;
    autoBreak = b.autoBreak;
  } else if (e) {
    switch (e.day_type) {
      case 'urlaub':
      case 'krank':
      case 'halber_urlaub':
        ist = soll; // Gutschrift in Höhe des Solls
        break;
      default:
        ist = 0; // Arbeit ohne Zeiten, Feiertag, Überstundenausgleich
    }
  }

  return {
    day, entry: e, plan, soll, ist, diff: ist - soll,
    breakDeducted, autoBreak, isHoliday,
    missing: !e && soll > 0 && day < today,
  };
}

export interface MonthResult {
  year: number;
  month: number;
  days: DayResult[];
  ist: number;
  soll: number;
  diff: number;
  carryIn: number;
  carryOut: number;
}

/**
 * Monatswerte. Mit `upTo` zählen nur Tage bis einschließlich dieses Datums
 * (Zwischenstand im laufenden Monat); ohne `upTo` der ganze Monat.
 */
export function computeMonth(
  year: number, month: number,
  schedule: ScheduleDay[], entries: TimeEntry[],
  carryIn: number, today: IsoDate, upTo?: IsoDate,
): MonthResult {
  const sMap = new Map(schedule.map((s) => [s.day, s]));
  const eMap = new Map(entries.map((e) => [e.day, e]));
  const days = monthDays(year, month).map((d) => computeDay(d, sMap.get(d), eMap.get(d), today));
  const counted = upTo ? days.filter((d) => d.day <= upTo) : days;
  const ist = counted.reduce((a, d) => a + d.ist, 0);
  const soll = counted.reduce((a, d) => a + d.soll, 0);
  return { year, month, days, ist, soll, diff: ist - soll, carryIn, carryOut: carryIn + ist - soll };
}

/**
 * Alle zwölf Monate mit Übertrag. Januar startet mit dem Vorjahresübertrag.
 * Monate nach `today` werden nur bis `today` gezählt, damit der Saldo im
 * laufenden Monat nicht durch künftige Solltage ins Minus läuft.
 */
export function computeYear(
  year: number, schedule: ScheduleDay[], entries: TimeEntry[],
  balance: YearBalance | null, today: IsoDate,
): MonthResult[] {
  const out: MonthResult[] = [];
  let carry = balance?.carry_minutes ?? 0;
  for (let m = 1; m <= 12; m++) {
    const prefix = `${year}-${String(m).padStart(2, '0')}`;
    const lastDay = makeDate(year, m + 1, 0);
    const upTo = lastDay > today ? today : undefined;
    const r = computeMonth(
      year, m,
      schedule.filter((s) => s.day.startsWith(prefix)),
      entries.filter((e) => e.day.startsWith(prefix)),
      carry, today, upTo,
    );
    out.push(r);
    carry = r.carryOut;
  }
  return out;
}

export interface VacationAccount {
  entitlement: number;
  carry: number;
  taken: number;
  rest: number;
}

export function vacationAccount(
  year: number, terms: EmploymentTerms[], entries: TimeEntry[], balance: YearBalance | null,
): VacationAccount {
  const t = termsFor(terms, makeDate(year, 12, 31));
  const entitlement = t?.vacation_days_per_year ?? 0;
  const carry = balance?.carry_vacation_days ?? 0;
  const taken = entries
    .filter((e) => e.day.startsWith(String(year)))
    .reduce((a, e) => a + (e.day_type === 'urlaub' ? 1 : e.day_type === 'halber_urlaub' ? 0.5 : 0), 0);
  return { entitlement, carry, taken, rest: entitlement + carry - taken };
}
