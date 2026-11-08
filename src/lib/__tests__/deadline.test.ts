import { describe, expect, it } from 'vitest';
import { deadlineState, isWorkday, releaseDeadline } from '../deadline';

describe('Freigabefrist 5. Werktag des Folgemonats', () => {
  it.each([
    // Monat, Frist, Begründung
    [2026, 12, '2027-01-08', '01.01. Neujahr fällt weg, Werktage 4.–8.1.'],
    [2027, 1, '2027-02-05', 'Februar beginnt am Montag'],
    [2027, 2, '2027-03-05', 'März beginnt am Montag'],
    [2027, 3, '2027-04-07', '1./2.4. Do/Fr, dann 5.–7.4.'],
    [2027, 4, '2027-05-10', '1.5. Samstag, 6.5. Himmelfahrt'],
    [2027, 5, '2027-06-07', '1.6. Di bis 4.6. Fr = 4, Mo 7.6. = 5'],
    [2027, 9, '2027-10-07', '3.10. Sonntag, kein Ersatztag'],
    [2027, 10, '2027-11-08', '1.11. Allerheiligen'],
    [2027, 12, '2028-01-07', 'Jahreswechsel'],
  ])('%i-%i → %s (%s)', (y, m, expected) => {
    expect(releaseDeadline(y, m)).toBe(expected);
  });

  it('Werktag: Mo–Fr ohne Feiertag', () => {
    expect(isWorkday('2027-05-06')).toBe(false); // Himmelfahrt
    expect(isWorkday('2027-05-08')).toBe(false); // Samstag
    expect(isWorkday('2027-05-07')).toBe(true);
  });

  it('Ampel', () => {
    expect(deadlineState('2027-02-05', '2027-02-01', false)).toBe('ok');
    expect(deadlineState('2027-02-05', '2027-02-03', false)).toBe('bald');
    expect(deadlineState('2027-02-05', '2027-02-05', false)).toBe('bald');
    expect(deadlineState('2027-02-05', '2027-02-06', false)).toBe('ueberfaellig');
    expect(deadlineState('2027-02-05', '2027-02-20', true)).toBe('erledigt');
  });
});
