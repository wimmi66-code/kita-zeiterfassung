// Minijob: Verdienst, Verdienstgrenze, Aufzeichnungsfrist § 17 MiLoG
import { addDays, diffDays, makeDate, type IsoDate } from './dates';
import type { DayResult } from './calc';
import type { EmploymentTerms, Parameter, ScheduleDay, TimeEntry } from './types';
import { termsFor } from './schedule';

/** Parameterwert, der an einem Datum gilt (größtes valid_from ≤ Datum). */
export function paramAt(params: Parameter[], key: string, date: IsoDate): number | null {
  let best: Parameter | null = null;
  for (const p of params) {
    if (p.key === key && p.valid_from <= date && (!best || p.valid_from > best.valid_from)) best = p;
  }
  return best ? Number(best.value) : null;
}

/** Verdienst in Cent aus Tageswerten; der Stundenlohn gilt je Tag laut Modellversion. */
export function earningsCents(days: Pick<DayResult, 'day' | 'ist'>[], terms: EmploymentTerms[]): number {
  let cents = 0;
  for (const d of days) {
    const wage = termsFor(terms, d.day)?.hourly_wage_cents ?? 0;
    cents += (d.ist * wage) / 60;
  }
  return Math.round(cents);
}

export type LimitLevel = 'ok' | 'warnung' | 'ueberschritten' | 'keine_grenze';

export interface LimitCheck {
  earned: number;
  limit: number;
  share: number;
  level: LimitLevel;
}

export function checkLimit(earnedCents: number, limitCents: number, warnShare: number): LimitCheck {
  if (limitCents <= 0) return { earned: earnedCents, limit: 0, share: 0, level: 'keine_grenze' };
  const share = earnedCents / limitCents;
  const level: LimitLevel = earnedCents > limitCents ? 'ueberschritten' : share >= warnShare ? 'warnung' : 'ok';
  return { earned: earnedCents, limit: limitCents, share, level };
}

/** Monatsgrenze laut Parametern, Stichtag Monatserster. */
export function monthlyLimit(params: Parameter[], year: number, month: number): number {
  return paramAt(params, 'minijob_verdienstgrenze_cent', makeDate(year, month, 1)) ?? 0;
}

/** Jahresgrenze = Summe der Monatsgrenzen (2027: 12 × 633 € = 7.596 €). */
export function yearlyLimit(params: Parameter[], year: number): number {
  let sum = 0;
  for (let m = 1; m <= 12; m++) sum += monthlyLimit(params, year, m);
  return sum;
}

/** Stundenlohn unter Mindestlohn? */
export function belowMinimumWage(t: EmploymentTerms, params: Parameter[]): boolean {
  const min = paramAt(params, 'mindestlohn_cent', t.valid_from);
  return min !== null && (t.hourly_wage_cents ?? 0) < min;
}

/** Kalenderdatum in Europe/Berlin aus einem Zeitstempel. */
export function berlinDate(ts: string): IsoDate {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(ts));
}

export type RecordState = 'faellig' | 'ueberfaellig' | 'verspaetet';

export interface RecordFlag {
  day: IsoDate;
  state: RecordState;
  dueBy: IsoDate;
}

/**
 * § 17 MiLoG: Aufzeichnung bis zum Ablauf des 7. auf den Arbeitstag folgenden Tages.
 *  · faellig      – geplanter Tag ohne Eintrag, Frist läuft noch
 *  · ueberfaellig – geplanter Tag ohne Eintrag, Frist abgelaufen
 *  · verspaetet   – Eintrag vorhanden, aber erst nach der Frist erstmals erfasst
 */
export function recordFlags(
  schedule: ScheduleDay[], entries: TimeEntry[], today: IsoDate, days = 7,
): RecordFlag[] {
  const eMap = new Map(entries.map((e) => [e.day, e]));
  const flags: RecordFlag[] = [];
  for (const s of schedule) {
    if (s.plan_minutes <= 0 || s.day > today || eMap.has(s.day)) continue;
    const dueBy = addDays(s.day, days);
    flags.push({ day: s.day, dueBy, state: diffDays(dueBy, today) > 0 ? 'ueberfaellig' : 'faellig' });
  }
  for (const e of entries) {
    if (!e.created_at || e.day_type !== 'arbeit') continue;
    const dueBy = addDays(e.day, days);
    if (berlinDate(e.created_at) > dueBy) flags.push({ day: e.day, dueBy, state: 'verspaetet' });
  }
  return flags.sort((a, b) => a.day.localeCompare(b.day));
}

export function formatEuro(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
