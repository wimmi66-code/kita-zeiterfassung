// Datenmodell eines Monatsnachweises (wie das bisherige Excel-Monatsblatt).
// Daraus entstehen PDF und XLSX.
import type { DayResult } from '../calc';
import { formatDe, MONATE, weekdayShort, type IsoDate } from '../dates';
import { formatDuration } from '../time';
import { DAY_TYPE_LABEL, type MonthClosing } from '../types';

export interface SheetRow {
  date: string;
  wd: string;
  type: string;
  k1: string; p1: string; g1: string;
  k2: string; p2: string; g2: string;
  ist: string; soll: string; diff: string;
  note: string;
  off: boolean;
}

export interface MonthSheet {
  title: string;
  person: string;
  year: number;
  month: number;
  rows: SheetRow[];
  totals: { carryIn: string; ist: string; soll: string; diff: string; carryOut: string };
  vermerk: string[];
  fileBase: string;
}

/** Zeitstempel als „05.11.2026 um 09:00 Uhr“ (Europe/Berlin). */
export function formatStamp(ts: string): string {
  const d = new Date(ts);
  const date = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  const time = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(d);
  return `${date} um ${time} Uhr`;
}

export interface SheetInput {
  pseudonym: string;
  name?: string | null;
  year: number;
  month: number;
  days: DayResult[];
  carryIn: number;
  closing: MonthClosing | null | undefined;
  createdAt?: string;
}

/** Für Dateien: normales Minus statt typografischem (PDF-Standardschrift kennt U+2212 nicht). */
const ascii = (t: string) => t.replace(/\u2212/g, '-');
const dur = (m: number, plus = false) => ascii(formatDuration(m, plus));

export function buildMonthSheet(i: SheetInput): MonthSheet {
  const rows: SheetRow[] = i.days.map((d) => {
    const e = d.entry;
    const typ = e && e.day_type !== 'arbeit' ? DAY_TYPE_LABEL[e.day_type] : !e && d.isHoliday ? 'Feiertag' : '';
    const hasTimes = !!e?.start1;
    return {
      date: formatDe(d.day),
      wd: weekdayShort(d.day),
      type: typ,
      k1: e?.start1 ?? '',
      p1: hasTimes ? dur(d.breakDeducted) : '',
      g1: e?.end1 ?? '',
      k2: e?.start2 ?? '',
      p2: '',
      g2: e?.end2 ?? '',
      ist: e || d.soll ? dur(d.ist) : '',
      soll: d.soll ? dur(d.soll) : '',
      diff: d.diff ? dur(d.diff, true) : '',
      note: e?.note ?? '',
      off: d.plan === 0 && !e,
    };
  });
  const ist = i.days.reduce((a, d) => a + d.ist, 0);
  const soll = i.days.reduce((a, d) => a + d.soll, 0);

  const c = i.closing;
  const vermerk: string[] = [];
  if (c?.status === 'freigegeben' && c.released_at) {
    vermerk.push(`Elektronisch freigegeben am ${formatStamp(c.released_at)}.`);
    if (c.acknowledged_at) vermerk.push(`Eingang beim Vorstand bestätigt am ${formatStamp(c.acknowledged_at)}.`);
    vermerk.push('Die Freigabe ersetzt die Unterschrift. Änderungen nach der Freigabe stehen mit Begründung im Änderungsprotokoll.');
  } else if (c?.status === 'eingereicht' && c.submitted_at) {
    vermerk.push(`ENTWURF: eingereicht am ${formatStamp(c.submitted_at)}, noch nicht freigegeben.`);
  } else {
    vermerk.push('ENTWURF: Monat noch nicht eingereicht und nicht freigegeben.');
  }
  vermerk.push(`Erstellt am ${formatStamp(i.createdAt ?? new Date().toISOString())} mit der Kita-Zeiterfassung.`);

  const mm = String(i.month).padStart(2, '0');
  return {
    title: `Arbeitszeitnachweis ${MONATE[i.month - 1]} ${i.year}`,
    person: i.name ? `${i.pseudonym} · ${i.name}` : i.pseudonym,
    year: i.year,
    month: i.month,
    rows,
    totals: {
      carryIn: dur(i.carryIn, true),
      ist: dur(ist),
      soll: dur(soll),
      diff: dur(ist - soll, true),
      carryOut: dur(i.carryIn + ist - soll, true),
    },
    vermerk,
    fileBase: `Arbeitszeit_${i.year}-${mm}_${i.pseudonym}`,
  };
}

export const COLUMNS = [
  'Datum', 'Tag', 'Tagesart', 'Kommen', 'Pause', 'Gehen', 'Kommen', 'Pause', 'Gehen',
  'Ist', 'Soll', 'Differenz', 'Bemerkungen',
] as const;

export function rowCells(r: SheetRow): string[] {
  return [r.date, r.wd, r.type, r.k1, r.p1, r.g1, r.k2, r.p2, r.g2, r.ist, r.soll, r.diff, r.note];
}

export type { IsoDate };
