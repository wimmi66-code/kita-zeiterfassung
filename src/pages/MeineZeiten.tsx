import { useCallback, useEffect, useState } from 'react';
import { deleteOwnEntry, loadYearData, saveOwnEntry, submitMonth, type YearData } from '../lib/api';
import { formatDe, makeDate, MONATE, todayIso } from '../lib/dates';
import { errorText } from '../lib/errors';
import MonthView, { monthStatus } from './zeiten/MonthView';

export default function MeineZeiten({ employeeId }: { employeeId: string }) {
  const today = todayIso();
  const [ym, setYm] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }));
  const [data, setData] = useState<YearData | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setData(await loadYearData(employeeId, ym.year));
  }, [employeeId, ym.year]);

  useEffect(() => {
    setData(null);
    reload().catch((e) => setMsg(errorText(e)));
  }, [reload]);

  function shift(delta: number) {
    setMsg(null);
    setYm(({ year, month }) => {
      const t = year * 12 + (month - 1) + delta;
      return { year: Math.floor(t / 12), month: (t % 12) + 1 };
    });
  }

  const status = data ? monthStatus(data, ym.month) : 'offen';
  const editable = status === 'offen' || status === 'zurueckgegeben';
  const lastDay = makeDate(ym.year, ym.month + 1, 0);
  const canSubmit = editable && today >= lastDay;

  async function submit() {
    if (!data) return;
    const prefix = `${ym.year}-${String(ym.month).padStart(2, '0')}`;
    const planned = data.schedule.filter((s) => s.day.startsWith(prefix) && s.plan_minutes > 0).map((s) => s.day);
    const done = new Set(data.entries.map((e) => e.day));
    const open = planned.filter((d) => !done.has(d));
    const text = open.length
      ? `${open.length} geplante Tage haben keinen Eintrag (z. B. ${formatDe(open[0])}). Trotzdem einreichen?`
      : `${MONATE[ym.month - 1]} ${ym.year} einreichen? Danach sind die Einträge gesperrt.`;
    if (!window.confirm(text)) return;
    setBusy(true);
    try {
      await submitMonth(ym.year, ym.month);
      await reload();
      setMsg('Monat eingereicht. Die Leitung wird ihn prüfen.');
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="monthnav">
        <button onClick={() => shift(-1)} aria-label="Vormonat">‹</button>
        <h2>{MONATE[ym.month - 1]} {ym.year}</h2>
        <button onClick={() => shift(1)} aria-label="Folgemonat">›</button>
      </div>

      {!data ? <p className="hint">Lade …</p> : data.schedule.length === 0 && data.entries.length === 0 ? (
        <p className="note">Für {ym.year} ist noch kein Dienstplan hinterlegt. Bitte an die Leitung wenden.</p>
      ) : (
        <MonthView employeeId={employeeId} year={ym.year} month={ym.month} data={data} today={today}
          editable={editable}
          onSave={async (e) => { await saveOwnEntry(e); await reload(); }}
          onDelete={async (d) => { await deleteOwnEntry(employeeId, d); await reload(); }} />
      )}

      {data && editable && (
        <div className="stack">
          <button className="primary" disabled={!canSubmit || busy} onClick={submit}>Monat einreichen</button>
          {!canSubmit && <p className="hint">Einreichen ist ab dem {formatDe(lastDay)} möglich.</p>}
        </div>
      )}
      {msg && <p className="note" role="status">{msg}</p>}
    </div>
  );
}
