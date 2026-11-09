import { describe, expect, it } from 'vitest';
import { computeMonth } from '../calc';
import { buildYearCsv } from '../export/csv';
import { buildMonthSheet } from '../export/monthSheet';
import { sheetToPdf } from '../export/pdf';
import { sheetToXlsx } from '../export/xlsx';
import { generateSchedule } from '../schedule';
import type { EmploymentTerms, MonthClosing, TimeEntry } from '../types';

const terms: EmploymentTerms = {
  employee_id: 'x', valid_from: '2026-10-01', kind: 'vollzeit', weekly_minutes: 2340,
  plan_minutes: [504, 504, 444, 444, 444, 0, 0], monday_biweekly_from: null,
  fixed_start: null, fixed_end: null, vacation_days_per_year: 30, hourly_wage_cents: null,
};
const e = (day: string, p: Partial<TimeEntry>): TimeEntry =>
  ({ employee_id: 'x', day, day_type: 'arbeit', start1: null, end1: null, start2: null, end2: null, break_minutes: null, note: null, ...p });
const entries = [
  e('2026-10-01', { start1: '06:45', end1: '15:09', break_minutes: 30 }),
  e('2026-10-15', { start1: '06:45', end1: '14:39', start2: '16:00', end2: '18:00', break_minutes: 30, note: 'JA; "Elternabend"' }),
  e('2026-10-19', { day_type: 'urlaub' }),
];
const schedule = generateSchedule('x', [terms], '2026-10-01', '2026-10-31');
const closing: MonthClosing = {
  employee_id: 'x', year: 2026, month: 10, status: 'freigegeben', submitted_at: '2026-11-02T08:00:00Z',
  released_at: '2026-11-05T08:00:00Z', released_by: null, returned_at: null, return_reason: null,
  acknowledged_at: '2026-11-06T10:30:00Z', summary: null,
};

describe('Monatsnachweis', () => {
  const m = computeMonth(2026, 10, schedule, entries, 1218, '2026-12-31');
  const s = buildMonthSheet({ pseudonym: 'MA-02', year: 2026, month: 10, days: m.days, carryIn: 1218, closing, createdAt: '2026-11-09T12:00:00Z' });

  it('Zeilen wie im Excel-Blatt', () => {
    expect(s.rows).toHaveLength(31);
    expect(s.rows[0]).toMatchObject({ date: '01.10.2026', wd: 'Do', k1: '06:45', p1: '0:30', g1: '15:09', ist: '7:54', soll: '7:24', diff: '+0:30' });
    expect(s.rows[14]).toMatchObject({ k2: '16:00', g2: '18:00', ist: '9:24' });
    expect(s.rows[18]).toMatchObject({ type: 'Urlaub', ist: '8:24', soll: '8:24', diff: '' });
    expect(s.rows[2]).toMatchObject({ wd: 'Sa', off: true });
  });

  it('Freigabevermerk statt Unterschrift, Berliner Zeit', () => {
    expect(s.vermerk[0]).toBe('Elektronisch freigegeben am 05.11.2026 um 09:00 Uhr.');
    expect(s.vermerk[1]).toBe('Eingang beim Vorstand bestätigt am 06.11.2026 um 11:30 Uhr.');
    expect(s.fileBase).toBe('Arbeitszeit_2026-10_MA-02');
  });

  it('Entwurf, wenn nicht freigegeben', () => {
    const d = buildMonthSheet({ pseudonym: 'MA-02', year: 2026, month: 10, days: m.days, carryIn: 0, closing: null });
    expect(d.vermerk[0]).toMatch(/^ENTWURF/);
  });

  it('PDF und XLSX werden erzeugt', async () => {
    const pdf = await sheetToPdf(s);
    const xlsx = await sheetToXlsx(s);
    expect(pdf.size).toBeGreaterThan(3000);
    expect(new TextDecoder().decode(new Uint8Array(await pdf.slice(0, 5).arrayBuffer()))).toBe('%PDF-');
    expect(xlsx.size).toBeGreaterThan(3000);
  }, 20000);
});

describe('Jahres-CSV', () => {
  it('eine Zeile je Tag mit Eintrag oder Soll, Semikolon, Anführungszeichen maskiert', () => {
    const csv = buildYearCsv(2026, [{ pseudonym: 'MA-02', schedule, entries, closings: [closing] }], false);
    const lines = csv.trim().split('\r\n');
    expect(csv.startsWith('\uFEFFpseudonym;datum;tagesart')).toBe(true);
    expect(lines).toHaveLength(1 + 22); // 22 Werktage im Oktober 2026
    expect(lines[1]).toContain('MA-02;2026-10-01;arbeit;06:45;15:09;;;30;474;444;30;');
    expect(csv).toContain('"JA; ""Elternabend"""');
    expect(lines[2]).toContain('kein_eintrag');
  });
});
