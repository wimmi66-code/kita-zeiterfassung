// Jahresexport aller Tageswerte als CSV (Archiv, Aufbewahrung mind. 2 Jahre)
import { computeMonth } from '../calc';
import type { MonthClosing, ScheduleDay, TimeEntry } from '../types';
import { STATUS_LABEL } from '../types';

export interface CsvPerson {
  pseudonym: string;
  name?: string | null;
  schedule: ScheduleDay[];
  entries: TimeEntry[];
  closings: MonthClosing[];
}

const HEADER = [
  'pseudonym', 'name', 'datum', 'tagesart', 'kommen1', 'gehen1', 'kommen2', 'gehen2',
  'pause_abgezogen_min', 'ist_min', 'soll_min', 'differenz_min', 'bemerkung',
  'monatsstatus', 'freigegeben_am', 'eingang_bestaetigt_am', 'erfasst_am', 'geaendert_am',
];

function cell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildYearCsv(year: number, people: CsvPerson[], withNames: boolean): string {
  const lines = [HEADER.filter((h) => withNames || h !== 'name').join(';')];
  for (const p of people) {
    for (let m = 1; m <= 12; m++) {
      const prefix = `${year}-${String(m).padStart(2, '0')}`;
      const sched = p.schedule.filter((s) => s.day.startsWith(prefix));
      const ent = p.entries.filter((e) => e.day.startsWith(prefix));
      if (!sched.length && !ent.length) continue;
      const c = p.closings.find((x) => x.month === m);
      const res = computeMonth(year, m, sched, ent, 0, '9999-12-31');
      for (const d of res.days) {
        const e = d.entry;
        if (!e && d.soll === 0) continue;
        const vals: (string | number | null | undefined)[] = [
          p.pseudonym, ...(withNames ? [p.name ?? ''] : []), d.day, e?.day_type ?? 'kein_eintrag',
          e?.start1, e?.end1, e?.start2, e?.end2,
          e?.start1 ? d.breakDeducted : '', d.ist, d.soll, d.diff, e?.note,
          STATUS_LABEL[c?.status ?? 'offen'], c?.released_at ?? '', c?.acknowledged_at ?? '',
          e?.created_at ?? '', e?.updated_at ?? '',
        ];
        lines.push(vals.map(cell).join(';'));
      }
    }
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
