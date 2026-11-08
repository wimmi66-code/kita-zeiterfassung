import { describe, expect, it } from 'vitest';
import {
  belowMinimumWage, berlinDate, checkLimit, earningsCents, monthlyLimit, paramAt, recordFlags, yearlyLimit,
} from '../minijob';
import type { EmploymentTerms, Parameter, ScheduleDay, TimeEntry } from '../types';

const params: Parameter[] = [
  { key: 'minijob_verdienstgrenze_cent', valid_from: '2027-01-01', value: 63300 },
  { key: 'minijob_warnschwelle', valid_from: '2027-01-01', value: 0.9 },
  { key: 'mindestlohn_cent', valid_from: '2027-01-01', value: 1460 },
];

const terms: EmploymentTerms = {
  employee_id: 'v', valid_from: '2027-01-01', kind: 'minijob_vertretung', weekly_minutes: null,
  plan_minutes: [0, 0, 0, 0, 0, 0, 0], monday_biweekly_from: null, fixed_start: null, fixed_end: null,
  vacation_days_per_year: null, hourly_wage_cents: 1500,
};

describe('Verdienstgrenze Minijob', () => {
  it('Parameter mit Gültigkeit', () => {
    expect(paramAt(params, 'minijob_verdienstgrenze_cent', '2026-12-31')).toBeNull();
    expect(monthlyLimit(params, 2027, 1)).toBe(63300);
    const neu = [...params, { key: 'minijob_verdienstgrenze_cent', valid_from: '2028-01-01', value: 65000 }];
    expect(monthlyLimit(neu, 2027, 12)).toBe(63300);
    expect(monthlyLimit(neu, 2028, 1)).toBe(65000);
  });

  it('Jahresgrenze 2027 = 12 × 633 € = 7.596 €', () => {
    expect(yearlyLimit(params, 2027)).toBe(759600);
  });

  it('Verdienst = Stunden × Stundenlohn', () => {
    // 10 Tage à 4 h × 15,00 € = 600,00 €
    const days = Array.from({ length: 10 }, (_, i) => ({ day: `2027-03-${String(i + 1).padStart(2, '0')}`, ist: 240 }));
    expect(earningsCents(days, [terms])).toBe(60000);
  });

  it('Lohnänderung im Monat wird tagesgenau berücksichtigt', () => {
    const neu = { ...terms, valid_from: '2027-03-16', hourly_wage_cents: 1600 };
    expect(earningsCents([{ day: '2027-03-15', ist: 60 }, { day: '2027-03-16', ist: 60 }], [terms, neu])).toBe(3100);
  });

  it('Warnung ab 90 %, Überschreitung über 100 %', () => {
    expect(checkLimit(56900, 63300, 0.9).level).toBe('ok');          // 89,9 %
    expect(checkLimit(56970, 63300, 0.9).level).toBe('warnung');     // genau 90 %
    expect(checkLimit(63300, 63300, 0.9).level).toBe('warnung');     // genau an der Grenze
    expect(checkLimit(63301, 63300, 0.9).level).toBe('ueberschritten');
  });

  it('Mindestlohnprüfung', () => {
    expect(belowMinimumWage(terms, params)).toBe(false);
    expect(belowMinimumWage({ ...terms, hourly_wage_cents: 1390 }, params)).toBe(true);
  });
});

describe('Aufzeichnungsfrist § 17 MiLoG', () => {
  const s = (day: string, plan = 120): ScheduleDay =>
    ({ employee_id: 'h', day, plan_minutes: plan, fixed_start: null, fixed_end: null, is_holiday: false, is_override: false, note: null });
  const e = (day: string, created_at: string): TimeEntry =>
    ({ employee_id: 'h', day, day_type: 'arbeit', start1: '11:30', end1: '13:30', start2: null, end2: null, break_minutes: null, note: null, created_at });

  it('offen, überfällig, verspätet', () => {
    const flags = recordFlags(
      [s('2027-03-01'), s('2027-03-02'), s('2027-03-08'), s('2027-03-09'), s('2027-03-20')],
      [e('2027-03-02', '2027-03-03T10:00:00Z'), e('2027-03-09', '2027-03-17T10:00:00Z')],
      '2027-03-09',
    );
    expect(flags).toEqual([
      { day: '2027-03-01', dueBy: '2027-03-08', state: 'ueberfaellig' },
      { day: '2027-03-08', dueBy: '2027-03-15', state: 'faellig' },
      { day: '2027-03-09', dueBy: '2027-03-16', state: 'verspaetet' },
    ]);
  });

  it('Frist endet mit dem 7. Tag (Berliner Zeit)', () => {
    // 16.03. 23:30 Berlin = 22:30 UTC → noch rechtzeitig
    expect(berlinDate('2027-03-16T22:30:00Z')).toBe('2027-03-16');
    expect(recordFlags([], [e('2027-03-09', '2027-03-16T22:30:00Z')], '2027-03-20')).toEqual([]);
  });
});
