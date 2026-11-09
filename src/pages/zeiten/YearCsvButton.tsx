import { useState } from 'react';
import { loadEmployees, loadEntries, loadReleasedYear, loadSchedule, loadYearData } from '../../lib/api';
import { makeDate } from '../../lib/dates';
import { errorText } from '../../lib/errors';
import { buildYearCsv, type CsvPerson } from '../../lib/export/csv';
import { downloadBlob } from '../../lib/export/download';

/** Jahresexport aller sichtbaren Tageswerte. Leitung: alle Personen, auf Wunsch mit Klarnamen. Vorstand: nur freigegebene Monate. */
export default function YearCsvButton({ year, mode }: { year: number; mode: 'leitung' | 'vorstand' }) {
  const [withNames, setWithNames] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      let people: CsvPerson[];
      if (mode === 'leitung') {
        const emps = await loadEmployees();
        const data = await Promise.all(emps.map((e) => loadYearData(e.id, year)));
        people = emps.map((e, i) => ({
          pseudonym: e.pseudonym,
          name: [e.first_name, e.last_name].filter(Boolean).join(' ') || null,
          schedule: data[i].schedule, entries: data[i].entries, closings: data[i].closings,
        }));
      } else {
        const r = await loadReleasedYear(year);
        const from = makeDate(year, 1, 1), to = makeDate(year, 12, 31);
        const ids = [...new Set(r.closings.map((c) => c.employee_id))];
        people = await Promise.all(ids.map(async (id) => ({
          pseudonym: r.employees.find((e) => e.id === id)?.pseudonym ?? '?',
          schedule: await loadSchedule(id, from, to),
          entries: await loadEntries(id, from, to),
          closings: r.closings.filter((c) => c.employee_id === id),
        })));
      }
      people.sort((a, b) => a.pseudonym.localeCompare(b.pseudonym));
      const csv = buildYearCsv(year, people, mode === 'leitung' && withNames);
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }),
        `Arbeitszeiten_${year}${mode === 'vorstand' ? '_freigegeben' : ''}${withNames ? '_mit_Namen' : ''}.csv`);
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h3>Jahresexport {year} (CSV)</h3>
      <p className="hint">
        Alle Tageswerte {mode === 'vorstand' ? 'der freigegebenen Monate ' : ''}zur Archivierung (Aufbewahrung mindestens 2 Jahre).
        Öffnet sich in Excel.
      </p>
      {mode === 'leitung' && (
        <label className="check">
          <input type="checkbox" checked={withNames} onChange={(e) => setWithNames(e.target.checked)} />
          mit Klarnamen (Datei dann vertraulich behandeln)
        </label>
      )}
      <button disabled={busy} onClick={run}>{busy ? 'Erstelle …' : 'CSV herunterladen'}</button>
      {msg && <p className="error">{msg}</p>}
    </section>
  );
}
