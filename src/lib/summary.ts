// Monatsstand, der bei der Freigabe gespeichert wird (Snapshot für Vorstand und Export)
import { computeYear } from './calc';
import { makeDate, type IsoDate } from './dates';
import { earningsCents } from './minijob';
import { termsFor } from './schedule';
import type { EmploymentTerms, MonthSummary, ScheduleDay, TimeEntry, YearBalance } from './types';
import { isMinijob } from './types';

export interface SummaryInput {
  terms: EmploymentTerms[];
  schedule: ScheduleDay[];
  entries: TimeEntry[];
  balance: YearBalance | null;
}

export function buildSummary(d: SummaryInput, year: number, month: number, today: IsoDate): MonthSummary {
  const y = computeYear(year, d.schedule, d.entries, d.balance, today);
  const m = y[month - 1];
  const t = termsFor(d.terms, makeDate(year, month, 15)) ?? termsFor(d.terms, makeDate(year, month + 1, 0));
  const mini = !!t && isMinijob(t.kind);
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const urlaub = d.entries
    .filter((e) => e.day.startsWith(prefix))
    .reduce((a, e) => a + (e.day_type === 'urlaub' ? 1 : e.day_type === 'halber_urlaub' ? 0.5 : 0), 0);
  return {
    ist_min: m.ist,
    soll_min: m.soll,
    diff_min: m.diff,
    carry_in_min: m.carryIn,
    carry_out_min: m.carryOut,
    urlaub_tage: urlaub,
    verdienst_cent: mini ? earningsCents(m.days, d.terms) : null,
    verdienst_jahr_cent: mini ? earningsCents(y.slice(0, month).flatMap((x) => x.days), d.terms) : null,
  };
}
