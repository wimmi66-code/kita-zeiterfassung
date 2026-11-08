import { describe, expect, it } from 'vitest';
import { easterSunday, isHoliday, nrwHolidays } from '../holidays';

describe('Ostersonntag', () => {
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2028, '2028-04-16'],
  ])('%i → %s', (y, d) => expect(easterSunday(y)).toBe(d));
});

describe('Feiertage NRW 2027', () => {
  it('liefert alle elf Feiertage mit korrektem Datum', () => {
    expect(nrwHolidays(2027).map((h) => `${h.date} ${h.name}`)).toEqual([
      '2027-01-01 Neujahr',
      '2027-03-26 Karfreitag',
      '2027-03-29 Ostermontag',
      '2027-05-01 Tag der Arbeit',
      '2027-05-06 Christi Himmelfahrt',
      '2027-05-17 Pfingstmontag',
      '2027-05-27 Fronleichnam',
      '2027-10-03 Tag der Deutschen Einheit',
      '2027-11-01 Allerheiligen',
      '2027-12-25 1. Weihnachtstag',
      '2027-12-26 2. Weihnachtstag',
    ]);
  });

  it('kennt keine Feiertage anderer Länder', () => {
    expect(isHoliday('2027-01-06')).toBe(false); // Heilige Drei Könige (BW, BY, ST)
    expect(isHoliday('2027-10-31')).toBe(false); // Reformationstag
    expect(isHoliday('2027-11-17')).toBe(false); // Buß- und Bettag (SN)
    expect(isHoliday('2027-03-08')).toBe(false); // Frauentag (BE, MV)
  });
});
