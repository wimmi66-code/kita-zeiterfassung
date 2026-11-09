import { useCallback, useEffect, useState } from 'react';
import {
  correctDeleteEntry, correctEntry, loadYearData, releaseMonth, returnMonth, submitMonthFor, updateSummary, type YearData,
} from '../lib/api';
import { formatDe, makeDate, MONATE, todayIso, weekdayShort } from '../lib/dates';
import { deadlineState, releaseDeadline } from '../lib/deadline';
import { errorText } from '../lib/errors';
import { paramAt } from '../lib/minijob';
import { buildSummary } from '../lib/summary';
import { formatDuration } from '../lib/time';
import type { Employee, Parameter } from '../lib/types';
import ExportButtons, { sheetFromYearData } from './zeiten/ExportButtons';
import MonthView from './zeiten/MonthView';

interface Props {
  emp: Employee;
  name: string | null;
  year: number;
  month: number;
  params: Parameter[];
  onBack: () => void;
}

export default function Review({ emp, name, year, month, params, onBack }: Props) {
  const today = todayIso();
  const [data, setData] = useState<YearData | null>(null);
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState('');
  const [onBehalf, setOnBehalf] = useState('Unterschriebener Stundenzettel liegt vor');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const d = await loadYearData(emp.id, year);
    setData(d);
    return d;
  }, [emp.id, year]);

  useEffect(() => {
    reload().catch((e) => setMsg(errorText(e)));
  }, [reload]);

  /** Nach Korrektur in freigegebenen Monaten: Stand dieses und aller späteren freigegebenen Monate neu speichern. */
  async function refreshReleased(d: YearData, fromMonth: number, why: string) {
    const released = d.closings.filter((c) => c.status === 'freigegeben' && c.month >= fromMonth)
      .sort((a, b) => a.month - b.month);
    for (const c of released) {
      const s = buildSummary(d, year, c.month, today);
      await updateSummary(emp.id, year, c.month, s, c.month === fromMonth ? why : `Folgeänderung Übertrag: ${why}`);
    }
  }

  async function afterCorrection(day: string, why: string) {
    const d = await reload();
    const m = Number(day.slice(5, 7));
    if (d.closings.some((c) => c.status === 'freigegeben' && c.month >= m)) {
      await refreshReleased(d, m, why);
      await reload();
    }
  }

  async function act(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await reload();
      setMsg(ok);
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const closing = data?.closings.find((c) => c.month === month);
  const status = closing?.status ?? 'offen';
  const n = paramAt(params, 'freigabe_frist_werktag', makeDate(year, month, 1)) ?? 5;
  const deadline = releaseDeadline(year, month, n);
  const st = deadlineState(deadline, today, status === 'freigegeben');
  const summary = data ? buildSummary(data, year, month, today) : null;

  return (
    <div className="stack">
      <button className="link" onClick={onBack}>← Übersicht</button>
      <h2>{emp.pseudonym}{name && <span className="hint"> · {name}</span>} – {MONATE[month - 1]} {year}</h2>
      <p className={st === 'ueberfaellig' ? 'note errbox' : 'note'}>
        Frist: {weekdayShort(deadline)}, {formatDe(deadline)}{st === 'ueberfaellig' && ' – überfällig'}
      </p>

      {!data ? <p className="hint">Lade …</p> : (
        <>
          <MonthView employeeId={emp.id} year={year} month={month} data={data} today={today}
            editable correction
            onSave={async (e, why) => { await correctEntry(e, why!); await afterCorrection(e.day, why!); }}
            onDelete={async (d, why) => { await correctDeleteEntry(emp.id, d, why!); await afterCorrection(d, why!); }} />

          <section className="card">
            <h3>Prüfung</h3>
            {status === 'eingereicht' && summary && (
              <>
                <p>Eingereicht am {formatDe(closing!.submitted_at!.slice(0, 10))}.</p>
                <dl className="sums">
                  <dt>Ist / Soll</dt><dd>{formatDuration(summary.ist_min)} / {formatDuration(summary.soll_min)}</dd>
                  <dt>Saldo neu</dt><dd>{formatDuration(summary.carry_out_min, true)}</dd>
                  <dt>Urlaubstage</dt><dd>{summary.urlaub_tage}</dd>
                </dl>
                {!returning ? (
                  <div className="row">
                    <button className="primary" disabled={busy} onClick={() => {
                      if (window.confirm(`${emp.pseudonym}, ${MONATE[month - 1]} ${year} freigeben? Danach sind Änderungen nur noch mit Begründung möglich.`)) {
                        act(() => releaseMonth(emp.id, year, month, summary), 'Monat freigegeben.');
                      }
                    }}>Freigeben</button>
                    <button disabled={busy} onClick={() => setReturning(true)}>Zurückgeben</button>
                  </div>
                ) : (
                  <div className="stack">
                    <label>Was soll ergänzt oder geändert werden?
                      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="z. B. Bitte 14.10. nachtragen" />
                    </label>
                    <div className="row">
                      <button className="primary" disabled={busy || reason.trim().length < 5}
                        onClick={() => act(async () => { await returnMonth(emp.id, year, month, reason); setReturning(false); setReason(''); }, 'Monat zurückgegeben.')}>
                        Zurückgeben
                      </button>
                      <button onClick={() => setReturning(false)}>Abbrechen</button>
                    </div>
                  </div>
                )}
              </>
            )}
            {(status === 'offen' || status === 'zurueckgegeben') && (
              <div className="stack">
                <p className="hint">Noch nicht eingereicht{status === 'zurueckgegeben' ? ' (zurückgegeben)' : ''}. Freigeben lässt sich der Monat erst nach dem Einreichen.</p>
                <p className="hint">Liegt der Stundenzettel auf Papier oder als Excel-Datei vor, kannst du den Monat im Auftrag einreichen und danach freigeben.</p>
                <label>Begründung (steht im Protokoll)
                  <input value={onBehalf} onChange={(e) => setOnBehalf(e.target.value)} />
                </label>
                <button disabled={busy || onBehalf.trim().length < 5 || today < makeDate(year, month + 1, 0)}
                  onClick={() => act(() => submitMonthFor(emp.id, year, month, onBehalf), 'Im Auftrag eingereicht. Jetzt prüfen und freigeben.')}>
                  Im Auftrag einreichen
                </button>
              </div>
            )}
            {status === 'freigegeben' && (
              <p className="hint">
                Freigegeben am {formatDe(closing!.released_at!.slice(0, 10))}
                {closing!.acknowledged_at ? `, Eingang vom Vorstand bestätigt am ${formatDe(closing!.acknowledged_at.slice(0, 10))}` : ''}.
                Korrekturen sind mit Begründung weiter möglich; der Monatsstand wird dann neu gespeichert und protokolliert.
              </p>
            )}
            {msg && <p className="note" role="status">{msg}</p>}
          </section>

          <section className="card">
            <ExportButtons make={() => sheetFromYearData(data, emp.pseudonym, name, year, month, today)} />
            {name && <p className="hint">Der Nachweis enthält den Klarnamen, weil du ihn als Leitung siehst.</p>}
          </section>
        </>
      )}
    </div>
  );
}
