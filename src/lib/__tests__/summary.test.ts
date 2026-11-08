import { describe, expect, it } from 'vitest';
import { buildSummary } from '../summary';
import type { EmploymentTerms, ScheduleDay, TimeEntry } from '../types';

const mini: EmploymentTerms = {
  employee_id: 'v', valid_from: '2027-01-01', kind: 'minijob_vertretung', weekly_minutes: null,
  plan_minutes: [0, 0, 0, 0, 0, 0, 0], monday_biweekly_from: null, fixed_start: null, fixed_end: null,
  vacation_days_per_year: null, hourly_wage_cents: 1500,
};
const e = (day: string, s: string, en: string): TimeEntry =>
  ({ employee_id: 'v', day, day_type: 'arbeit', start1: s, end1: en, start2: null, end2: null, break_minutes: null, note: null });

describe('Monatsstand bei Freigabe', () => {
  it('Minijob: Stunden, Verdienst Monat und Jahr', () => {
    const entries = [e('2027-01-05', '08:00', '12:00'), e('2027-02-03', '08:00', '14:00')];
    const schedule: ScheduleDay[] = [];
    const jan = buildSummary({ terms: [mini], schedule, entries, balance: null }, 2027, 1, '2027-12-31');
    const feb = buildSummary({ terms: [mini], schedule, entries, balance: null }, 2027, 2, '2027-12-31');
    expect(jan).toMatchObject({ ist_min: 240, soll_min: 0, verdienst_cent: 6000, verdienst_jahr_cent: 6000 });
    expect(feb).toMatchObject({ ist_min: 360, carry_in_min: 240, carry_out_min: 600, verdienst_cent: 9000, verdienst_jahr_cent: 15000 });
  });
});
