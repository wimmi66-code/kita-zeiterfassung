import { describe, expect, it } from 'vitest';
import { computeDay, computeMonth, computeYear, vacationAccount } from '../calc';
import { generateSchedule, planDay } from '../schedule';
import type { EmploymentTerms, ScheduleDay, TimeEntry } from '../types';

// Allgemeine Testmodelle (ohne Personenbezug)
const P = 468; // 7:48 h
const vollzeit: EmploymentTerms = {
  employee_id: 'x', valid_from: '2027-01-01', kind: 'vollzeit', weekly_minutes: 2340,
  plan_minutes: [P, P, P, P, P, 0, 0], monday_biweekly_from: null,
  fixed_start: null, fixed_end: null, vacation_days_per_year: 30, hourly_wage_cents: null,
};
const teilA: EmploymentTerms = {
  ...vollzeit, kind: 'stellenteilung', weekly_minutes: 1170,
  plan_minutes: [P, 0, 0, P, P, 0, 0], monday_biweekly_from: '2027-01-11', vacation_days_per_year: 15,
};
const teilB: EmploymentTerms = {
  ...teilA, plan_minutes: [P, P, P, 0, 0, 0, 0], monday_biweekly_from: '2027-01-04',
};
const alltag: EmploymentTerms = {
  ...vollzeit, kind: 'minijob_alltagshilfe', weekly_minutes: null,
  plan_minutes: [120, 120, 120, 120, 120, 0, 0], fixed_start: '11:30', fixed_end: '13:30',
  vacation_days_per_year: null, hourly_wage_cents: 1500,
};
const vertretung: EmploymentTerms = {
  ...alltag, kind: 'minijob_vertretung', plan_minutes: [0, 0, 0, 0, 0, 0, 0], fixed_start: null, fixed_end: null,
};

const sum = (s: ScheduleDay[]) => s.reduce((a, d) => a + d.plan_minutes, 0);

describe('Dienstplan / Soll', () => {
  it('Vollzeit: Mo–Fr 7:48, Feiertag 0', () => {
    expect(planDay('x', [vollzeit], '2027-01-04').plan_minutes).toBe(P);
    expect(planDay('x', [vollzeit], '2027-01-09').plan_minutes).toBe(0);
    const ny = planDay('x', [vollzeit], '2027-01-01');
    expect(ny).toMatchObject({ plan_minutes: 0, is_holiday: true, note: 'Neujahr' });
  });

  it('Stellenteilung A: Do/Fr, Montag 14-tägig ab 11.01.2027', () => {
    const plan = (d: string) => planDay('a', [teilA], d).plan_minutes;
    expect(plan('2027-01-04')).toBe(0);   // Mo vor Beginn
    expect(plan('2027-01-11')).toBe(P);   // erster Montag
    expect(plan('2027-01-18')).toBe(0);
    expect(plan('2027-01-25')).toBe(P);
    expect(plan('2027-01-12')).toBe(0);   // Di
    expect(plan('2027-01-14')).toBe(P);   // Do
    expect(plan('2027-01-15')).toBe(P);   // Fr
  });

  it('Stellenteilung B: Di/Mi, Montag 14-tägig ab 04.01.2027', () => {
    const plan = (d: string) => planDay('b', [teilB], d).plan_minutes;
    expect(plan('2027-01-04')).toBe(P);
    expect(plan('2027-01-11')).toBe(0);
    expect(plan('2027-01-18')).toBe(P);
    expect(plan('2027-01-12')).toBe(P);
    expect(plan('2027-01-14')).toBe(0);
  });

  it('Stellenteilung: A und B decken jeden Werktag genau einmal ab', () => {
    for (let d = 11; d <= 24; d++) {
      const day = `2027-01-${String(d).padStart(2, '0')}`;
      const a = planDay('a', [teilA], day).plan_minutes;
      const b = planDay('b', [teilB], day).plan_minutes;
      const wd = new Date(day).getUTCDay();
      expect(a + b).toBe(wd === 0 || wd === 6 ? 0 : P);
    }
  });

  it('Stellenteilung: 19,5 h je Woche im Zwei-Wochen-Mittel', () => {
    const a = generateSchedule('a', [teilA], '2027-01-11', '2027-01-24');
    const b = generateSchedule('b', [teilB], '2027-01-11', '2027-01-24');
    expect(sum(a)).toBe(2 * 1170);
    expect(sum(b)).toBe(2 * 1170);
  });

  it('Vollzeit: Januar 2027 = 20 Arbeitstage × 7:48 (Neujahr frei)', () => {
    expect(sum(generateSchedule('x', [vollzeit], '2027-01-01', '2027-01-31'))).toBe(20 * P);
  });

  it('Alltagshilfe mit fester Zeit, Vertretung ohne Soll', () => {
    expect(planDay('h', [alltag], '2027-01-04')).toMatchObject({ plan_minutes: 120, fixed_start: '11:30' });
    expect(planDay('v', [vertretung], '2027-01-04').plan_minutes).toBe(0);
  });

  it('Versionierung: neues Modell ab Stichtag', () => {
    const neu: EmploymentTerms = { ...vollzeit, valid_from: '2027-07-01', plan_minutes: [480, 480, 480, 480, 420, 0, 0] };
    expect(planDay('x', [vollzeit, neu], '2027-06-30').plan_minutes).toBe(P);
    expect(planDay('x', [vollzeit, neu], '2027-07-02').plan_minutes).toBe(420);
  });

  it('Überschriebene Tage (Tauschtag) bleiben bei Neuerzeugung erhalten', () => {
    const override: ScheduleDay = { ...planDay('a', [teilA], '2027-01-12'), plan_minutes: P, is_override: true, note: 'Tausch' };
    const gen = generateSchedule('a', [teilA], '2027-01-11', '2027-01-17', [override]);
    expect(gen.find((d) => d.day === '2027-01-12')).toBeUndefined();
    expect(gen).toHaveLength(6);
  });

  it('Gesperrte Tage werden übersprungen', () => {
    const gen = generateSchedule('x', [vollzeit], '2027-01-01', '2027-02-28', [], (d) => d < '2027-02-01');
    expect(gen[0].day).toBe('2027-02-01');
  });
});

const sched = (day: string, plan = P, is_holiday = false): ScheduleDay =>
  ({ employee_id: 'x', day, plan_minutes: plan, fixed_start: null, fixed_end: null, is_holiday, is_override: false, note: null });
const entry = (day: string, p: Partial<TimeEntry> = {}): TimeEntry =>
  ({ employee_id: 'x', day, day_type: 'arbeit', start1: null, end1: null, start2: null, end2: null, break_minutes: null, note: null, ...p });

describe('Tageswerte (wie Excel-Monatsblatt)', () => {
  const today = '2027-12-31';
  it('Arbeit mit Zeiten', () => {
    const r = computeDay('2027-01-04', sched('2027-01-04'), entry('2027-01-04', { start1: '07:00', end1: '15:48' }), today);
    expect(r).toMatchObject({ soll: P, ist: 498, diff: 30 });
  });
  it('Urlaub und Krank: Ist = Soll', () => {
    expect(computeDay('2027-01-04', sched('2027-01-04'), entry('2027-01-04', { day_type: 'urlaub' }), today).diff).toBe(0);
    expect(computeDay('2027-01-04', sched('2027-01-04'), entry('2027-01-04', { day_type: 'krank' }), today).ist).toBe(P);
  });
  it('Halber Urlaubstag: Soll halbiert, gearbeitete Zeit zählt', () => {
    const r = computeDay('2027-01-04', sched('2027-01-04'),
      entry('2027-01-04', { day_type: 'halber_urlaub', start1: '07:30', end1: '11:24' }), today);
    expect(r).toMatchObject({ soll: 234, ist: 234, diff: 0 });
  });
  it('Überstundenausgleich: Ist 0, Soll bleibt', () => {
    expect(computeDay('2027-01-04', sched('2027-01-04'), entry('2027-01-04', { day_type: 'ueberstundenausgleich' }), today))
      .toMatchObject({ ist: 0, soll: P, diff: -P });
  });
  it('Feiertag: Soll 0', () => {
    expect(computeDay('2027-01-01', sched('2027-01-01', 0, true), undefined, today)).toMatchObject({ soll: 0, missing: false });
  });
  it('Fehlender Eintrag wird markiert', () => {
    expect(computeDay('2027-01-04', sched('2027-01-04'), undefined, today)).toMatchObject({ missing: true, diff: -P });
  });
});

describe('Monat, Übertrag, Urlaub', () => {
  it('Übertrag Vorjahr → Januar → Februar', () => {
    const schedule = [sched('2027-01-04'), sched('2027-02-01')];
    const entries = [
      entry('2027-01-04', { start1: '07:00', end1: '15:48' }), // +30
      entry('2027-02-01', { start1: '07:30', end1: '15:18' }), // −30
    ];
    const year = computeYear(2027, schedule, entries,
      { employee_id: 'x', year: 2027, carry_minutes: 90, carry_vacation_days: 0 }, '2027-12-31');
    expect(year[0]).toMatchObject({ carryIn: 90, diff: 30, carryOut: 120 });
    expect(year[1]).toMatchObject({ carryIn: 120, diff: -30, carryOut: 90 });
    expect(year[11].carryOut).toBe(90);
  });

  it('Laufender Monat zählt nur bis heute', () => {
    const r = computeMonth(2027, 1, [sched('2027-01-04'), sched('2027-01-05')], [], 0, '2027-01-04', '2027-01-04');
    expect(r.soll).toBe(P);
  });

  it('Urlaubskonto Stellenteilung: 15 Tage', () => {
    const v = vacationAccount(2027, [teilA], [
      entry('2027-03-04', { day_type: 'urlaub' }),
      entry('2027-03-05', { day_type: 'halber_urlaub' }),
    ], { employee_id: 'a', year: 2027, carry_minutes: 0, carry_vacation_days: 2 });
    expect(v).toEqual({ entitlement: 15, carry: 2, taken: 1.5, rest: 15.5 });
  });
});
