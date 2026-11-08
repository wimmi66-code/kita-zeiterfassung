import { describe, expect, it } from 'vitest';
import { kuerzelFromName, parseImportCsv } from '../importCsv';

const head = 'kuerzel;datum;tagesart;kommen1;gehen1;kommen2;gehen2;pause_min;bemerkung';

describe('CSV-Import', () => {
  it('liest Einträge mit BOM, deutschem Datum und zwei Blöcken', () => {
    const r = parseImportCsv(`﻿${head}\r\nabc;15.10.2026;arbeit;6:45;14:39;16:00;18:00;30;JA\r\nABC;2026-10-19;Urlaub;;;;;;\r\n`);
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ kuerzel: 'ABC', entry: { day: '2026-10-15', start1: '06:45', end2: '18:00', break_minutes: 30, note: 'JA' } });
    expect(r.rows[1].entry).toMatchObject({ day_type: 'urlaub', start1: null, break_minutes: null });
  });

  it('meldet Fehler mit Zeilennummer', () => {
    const r = parseImportCsv(`${head}\nABC;2026-10-01;arbeit;15:00;08:00;;;;\nABC;2026-10-02;frei;;;;;;\nABC;2026-10-02;arbeit;08:00;;;;;`);
    expect(r.errors).toEqual([
      'Zeile 2: Gehen liegt vor Kommen.',
      'Zeile 3: Tagesart „frei“ unbekannt.',
      'Zeile 4: Kommen und Gehen nur paarweise.',
    ]);
  });

  it('Kürzel aus Nachnamen', () => {
    expect(kuerzelFromName('Müller')).toBe('MÜL');
    expect(kuerzelFromName('de Vries')).toBe('DEV');
  });
});
