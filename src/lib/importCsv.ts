// Import von Zeiteinträgen aus CSV (z. B. aus übertragenen Papier- oder Excel-Stundenzetteln)
// Format: kuerzel;datum;tagesart;kommen1;gehen1;kommen2;gehen2;pause_min;bemerkung
import { parseTime } from './time';
import type { DayType, TimeEntry } from './types';

export interface ImportRow {
  line: number;
  kuerzel: string;
  entry: Omit<TimeEntry, 'employee_id'>;
}

export interface ImportResult {
  rows: ImportRow[];
  errors: string[];
}

const TYPES: Record<string, DayType> = {
  arbeit: 'arbeit', urlaub: 'urlaub', halber_urlaub: 'halber_urlaub', 'halber urlaubstag': 'halber_urlaub',
  krank: 'krank', feiertag: 'feiertag', ueberstundenausgleich: 'ueberstundenausgleich',
  'überstundenausgleich': 'ueberstundenausgleich',
};

/** Kürzel normalisieren: Großbuchstaben, Leerzeichen weg. */
export function normKuerzel(s: string): string {
  return s.trim().toLocaleUpperCase('de-DE');
}

/** Kürzel aus einem Nachnamen: die ersten drei Buchstaben. */
export function kuerzelFromName(lastName: string): string {
  return normKuerzel(lastName.replace(/[^\p{L}]/gu, '').slice(0, 3));
}

function time(v: string, line: number, field: string, errors: string[]): string | null {
  const t = v.trim();
  if (!t) return null;
  const m = parseTime(t.replace('.', ':'));
  if (m === null) {
    errors.push(`Zeile ${line}: ${field} „${t}“ ist keine Uhrzeit.`);
    return null;
  }
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function parseImportCsv(text: string): ImportResult {
  const errors: string[] = [];
  const rows: ImportRow[] = [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const header = (lines[0] ?? '').split(';').map((h) => h.trim().toLowerCase());
  const idx = (n: string) => header.indexOf(n);
  for (const need of ['kuerzel', 'datum', 'tagesart']) {
    if (idx(need) < 0) errors.push(`Spalte „${need}“ fehlt in der Kopfzeile.`);
  }
  if (errors.length) return { rows, errors };

  const seen = new Set<string>();
  lines.slice(1).forEach((raw, i) => {
    const line = i + 2;
    if (!raw.trim()) return;
    const c = raw.split(';');
    const get = (n: string) => (idx(n) >= 0 ? (c[idx(n)] ?? '').trim() : '');
    const kuerzel = normKuerzel(get('kuerzel'));
    let datum = get('datum');
    const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(datum);
    if (de) datum = `${de[3]}-${de[2].padStart(2, '0')}-${de[1].padStart(2, '0')}`;
    if (!kuerzel) { errors.push(`Zeile ${line}: Kürzel fehlt.`); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) { errors.push(`Zeile ${line}: Datum „${get('datum')}“ ungültig.`); return; }
    const type = TYPES[get('tagesart').toLowerCase() || 'arbeit'];
    if (!type) { errors.push(`Zeile ${line}: Tagesart „${get('tagesart')}“ unbekannt.`); return; }
    const key = `${kuerzel}|${datum}`;
    if (seen.has(key)) { errors.push(`Zeile ${line}: ${kuerzel} am ${datum} doppelt.`); return; }
    seen.add(key);

    const before = errors.length;
    const start1 = time(get('kommen1'), line, 'Kommen', errors);
    const end1 = time(get('gehen1'), line, 'Gehen', errors);
    const start2 = time(get('kommen2'), line, 'Kommen 2', errors);
    const end2 = time(get('gehen2'), line, 'Gehen 2', errors);
    const p = get('pause_min');
    const pause = p === '' ? null : Number(p);
    if (pause !== null && (!Number.isInteger(pause) || pause < 0)) errors.push(`Zeile ${line}: Pause „${p}“ ungültig.`);
    if (!!start1 !== !!end1 || !!start2 !== !!end2) errors.push(`Zeile ${line}: Kommen und Gehen nur paarweise.`);
    if (start1 && end1 && end1 <= start1) errors.push(`Zeile ${line}: Gehen liegt vor Kommen.`);
    if (start2 && end2 && end2 <= start2) errors.push(`Zeile ${line}: Gehen 2 liegt vor Kommen 2.`);
    if (start2 && end1 && start2 < end1) errors.push(`Zeile ${line}: Block 2 beginnt vor Ende von Block 1.`);
    if (errors.length > before) return;

    rows.push({
      line, kuerzel,
      entry: {
        day: datum, day_type: type, start1, end1, start2, end2,
        break_minutes: pause, note: get('bemerkung') || null,
      },
    });
  });
  return { rows, errors };
}
