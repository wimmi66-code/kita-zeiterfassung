import { useMemo, useState } from 'react';
import { useAuth } from '../../auth';
import { correctEntry, saveOwnEntry, type EmployeeRow } from '../../lib/api';
import { formatDe } from '../../lib/dates';
import { errorText } from '../../lib/errors';
import { kuerzelFromName, parseImportCsv, type ImportResult } from '../../lib/importCsv';

interface Props {
  employees: EmployeeRow[];
  onClose: () => void;
}

export default function Import({ employees, onClose }: Props) {
  const { profile } = useAuth();
  const [file, setFile] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ImportResult | null>(null);
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('Übernahme aus Papier-/Excel-Stundenzettel');
  const [progress, setProgress] = useState<{ done: number; total: number; errors: string[] } | null>(null);

  const groups = useMemo(() => {
    if (!parsed) return [];
    const by = new Map<string, typeof parsed.rows>();
    for (const r of parsed.rows) by.set(r.kuerzel, [...(by.get(r.kuerzel) ?? []), r]);
    return [...by.entries()].map(([k, rows]) => {
      const days = rows.map((r) => r.entry.day).sort();
      const matches = employees.filter((e) => e.last_name && kuerzelFromName(e.last_name) === k);
      return { k, rows, from: days[0], to: days.at(-1)!, matches };
    });
  }, [parsed, employees]);

  async function onFile(f: File | undefined) {
    if (!f) return;
    const text = await f.text();
    const r = parseImportCsv(text);
    setFile(f.name);
    setParsed(r);
    setProgress(null);
    const a: Record<string, string> = {};
    const by = new Set(r.rows.map((x) => x.kuerzel));
    for (const k of by) {
      const m = employees.filter((e) => e.last_name && kuerzelFromName(e.last_name) === k);
      if (m.length === 1) a[k] = m[0].id;
    }
    setAssign(a);
  }

  async function run() {
    if (!parsed) return;
    const todo = parsed.rows.filter((r) => assign[r.kuerzel]);
    const errors: string[] = [];
    setProgress({ done: 0, total: todo.length, errors });
    let done = 0;
    for (const r of todo) {
      const employee_id = assign[r.kuerzel];
      const e = { ...r.entry, employee_id };
      try {
        if (employee_id === profile?.employee_id) await saveOwnEntry(e);
        else await correctEntry(e, reason);
      } catch (err) {
        errors.push(`${r.kuerzel} ${formatDe(r.entry.day)}: ${errorText(err)}`);
      }
      done += 1;
      setProgress({ done, total: todo.length, errors: [...errors] });
    }
  }

  const ready = groups.length > 0 && groups.every((g) => assign[g.k]) && reason.trim().length >= 5;

  return (
    <div className="stack">
      <button className="link" onClick={onClose}>← Alle Personen</button>
      <h2>Zeiten importieren</h2>
      <p className="hint">
        CSV-Datei mit Semikolon, Kopfzeile <code>kuerzel;datum;tagesart;kommen1;gehen1;kommen2;gehen2;pause_min;bemerkung</code>.
        Das Kürzel sind die ersten drei Buchstaben des Nachnamens laut Klarname. Vorhandene Einträge an denselben Tagen werden überschrieben.
      </p>
      <label>Datei auswählen
        <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>

      {parsed && (
        <>
          <p className="note">{file}: {parsed.rows.length} Einträge gelesen{parsed.errors.length ? `, ${parsed.errors.length} Fehler` : ''}.</p>
          {parsed.errors.length > 0 && <ul className="error">{parsed.errors.map((e) => <li key={e}>{e}</li>)}</ul>}

          <table className="plan">
            <thead><tr><th>Kürzel</th><th>Einträge</th><th>Zeitraum</th><th>Pseudonym</th></tr></thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.k}>
                  <td><strong>{g.k}</strong></td>
                  <td>{g.rows.length}</td>
                  <td>{formatDe(g.from).slice(0, 6)}–{formatDe(g.to).slice(0, 6)}</td>
                  <td>
                    <select value={assign[g.k] ?? ''} onChange={(e) => setAssign({ ...assign, [g.k]: e.target.value })}>
                      <option value="">– zuordnen –</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.pseudonym}{e.last_name ? ` (${e.first_name ?? ''} ${e.last_name})` : ''}
                        </option>
                      ))}
                    </select>
                    {g.matches.length === 0 && <div className="warn">kein Klarname passt</div>}
                    {g.matches.length > 1 && <div className="warn">mehrdeutig</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <label>Begründung (steht im Änderungsprotokoll)
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <p className="hint">Vor dem Import prüfen: Arbeitszeitmodell und Dienstplan für den Zeitraum müssen angelegt sein, sonst fehlt das Soll. Eigene Einträge der Leitung werden nur in offenen Monaten übernommen.</p>
          <button className="primary" disabled={!ready || (progress !== null && progress.done < progress.total)} onClick={run}>
            {parsed.rows.length} Einträge importieren
          </button>
        </>
      )}

      {progress && (
        <div className="note" role="status">
          {progress.done} von {progress.total} verarbeitet{progress.done === progress.total ? ` – ${progress.total - progress.errors.length} übernommen.` : ' …'}
          {progress.errors.length > 0 && <ul className="error">{progress.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}
