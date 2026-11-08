// Dienstplan aus Arbeitszeitmodell erzeugen
import { addDays, diffDays, isoWeekday, type IsoDate } from './dates';
import { holidayName } from './holidays';
import type { EmploymentTerms, ScheduleDay } from './types';
import { parseTime } from './time';

/** Gültige Modellversion für einen Tag (größtes valid_from ≤ Tag). */
export function termsFor(terms: EmploymentTerms[], day: IsoDate): EmploymentTerms | null {
  let best: EmploymentTerms | null = null;
  for (const t of terms) {
    if (t.valid_from <= day && (!best || t.valid_from > best.valid_from)) best = t;
  }
  return best;
}

/** Planminuten laut Modell, ohne Feiertagsprüfung. */
export function modelPlanMinutes(t: EmploymentTerms, day: IsoDate): number {
  if (t.kind === 'minijob_vertretung') return 0;
  const wd = isoWeekday(day);
  const base = t.plan_minutes[wd - 1] ?? 0;
  if (wd === 1 && t.monday_biweekly_from) {
    const delta = diffDays(t.monday_biweekly_from, day);
    if (delta < 0 || delta % 14 !== 0) return 0;
  }
  return base;
}

/** Planminuten aus fester Einsatzzeit (Alltagshilfe), Pause nach ArbZG nicht nötig bei ≤ 6 h. */
export function minutesBetween(start: string | null, end: string | null): number {
  const s = parseTime(start), e = parseTime(end);
  return s !== null && e !== null && e > s ? e - s : 0;
}

export function planDay(employeeId: string, terms: EmploymentTerms[], day: IsoDate): ScheduleDay {
  const t = termsFor(terms, day);
  const holiday = holidayName(day);
  const plan = t ? modelPlanMinutes(t, day) : 0;
  const fixed = t?.kind === 'minijob_alltagshilfe' && plan > 0;
  return {
    employee_id: employeeId,
    day,
    plan_minutes: holiday ? 0 : plan,
    fixed_start: fixed && !holiday ? t!.fixed_start : null,
    fixed_end: fixed && !holiday ? t!.fixed_end : null,
    is_holiday: holiday !== null,
    is_override: false,
    note: holiday,
  };
}

/**
 * Dienstplan für einen Zeitraum erzeugen. Von der Leitung überschriebene
 * Tage (is_override) und gesperrte Tage (z. B. freigegebene Monate) bleiben unverändert.
 */
export function generateSchedule(
  employeeId: string,
  terms: EmploymentTerms[],
  from: IsoDate,
  to: IsoDate,
  existing: ScheduleDay[] = [],
  isLocked: (day: IsoDate) => boolean = () => false,
): ScheduleDay[] {
  const keep = new Map(existing.filter((d) => d.is_override).map((d) => [d.day, d]));
  const out: ScheduleDay[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (keep.has(d) || isLocked(d)) continue;
    out.push(planDay(employeeId, terms, d));
  }
  return out;
}
