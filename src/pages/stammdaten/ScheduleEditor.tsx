import { useEffect, useState } from 'react';
import { loadClosings, loadSchedule, overrideDay, regenerateYear, resetOverride } from '../../lib/api';
import { formatDe, makeDate, MONATE, monthDays, weekdayShort } from '../../lib/dates';
import { errorText } from '../../lib/errors';
import { formatDuration, parseDuration } from '../../lib/time';
import type { ScheduleDay } from '../../lib/types';

interface Props {
  employeeId: string;
  year: number;
}

export default function ScheduleEditor({ employeeId, year }: Props) {
  const [month, setMonth] = useState(1);
  const [days, setDays] = useState<ScheduleDay[]>([]);
  const [released, setReleased] = useState<Set<number>>(new Set());
  const [edit, setEdit] = useState<Record<string, { plan: string; note: string }>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function reload() {
    const from = makeDate(year, month, 1);
    const to = monthDays(year, month).at(-1)!;
    const [s, c] = await Promise.all([loadSchedule(employeeId, from, to), loadClosings(employeeId, year)]);
    setDays(s);
    setReleased(new Set(c.filter((x) => x.status === 'freigegeben').map((x) => x.month)));
    setEdit({});
  }

  useEffect(() => {
    reload().catch((e) => setMsg(errorText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, year, month]);

  async function generate() {
    setBusy(true);
    setMsg(null);
    try {
      const n = await regenerateYear(employeeId, year);
      setMsg(`Dienstplan ${year} erzeugt (${n} Tage). Überschriebene Tage und freigegebene Monate blieben unverändert.`);
      await reload();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveDay(day: string) {
    const v = edit[day];
    const minutes = parseDuration(v.plan);
    if (minutes === null || minutes < 0) {
      setMsg('Planstunden bitte als h:mm eingeben, z. B. 7:48 oder 0:00.');
      return;
    }
    let reason: string | undefined;
    if (released.has(month)) {
      reason = window.prompt('Der Monat ist freigegeben. Begründung für die Änderung:') ?? '';
      if (reason.trim().length < 5) {
        setMsg('Ohne Begründung (mind. 5 Zeichen) wird nichts geändert.');
        return;
      }
    }
    try {
      await overrideDay(employeeId, day, minutes, v.note.trim() || null, reason);
      await reload();
      setMsg(null);
    } catch (e) {
      setMsg(errorText(e));
    }
  }

  async function reset(day: string) {
    try {
      await resetOverride(employeeId, day);
      await reload();
    } catch (e) {
      setMsg(errorText(e));
    }
  }

  const byDay = new Map(days.map((d) => [d.day, d]));
  const sum = days.reduce((a, d) => a + d.plan_minutes, 0);

  return (
    <div className="stack">
      <div className="row">
        <button className="primary" onClick={generate} disabled={busy}>
          {busy ? 'Erzeuge …' : `Dienstplan ${year} aus Modell erzeugen`}
        </button>
      </div>
      <p className="hint">Nach jeder Änderung am Arbeitszeitmodell neu erzeugen. Einzelne Tage (z. B. Tauschtage) unten überschreiben; diese bleiben beim Neuerzeugen erhalten.</p>

      <label>Monat
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONATE.map((m, i) => <option key={m} value={i + 1}>{m} {year}{released.has(i + 1) ? ' (freigegeben)' : ''}</option>)}
        </select>
      </label>

      {days.length === 0 ? (
        <p className="hint">Für diesen Monat gibt es noch keinen Dienstplan. Oben „erzeugen“ wählen.</p>
      ) : (
        <table className="plan">
          <thead>
            <tr><th>Tag</th><th>Plan</th><th>Hinweis</th><th /></tr>
          </thead>
          <tbody>
            {monthDays(year, month).map((d) => {
              const s = byDay.get(d);
              const e = edit[d];
              const we = ['Sa', 'So'].includes(weekdayShort(d));
              return (
                <tr key={d} className={we || s?.is_holiday ? 'off' : ''}>
                  <td>{weekdayShort(d)} {formatDe(d).slice(0, 6)}</td>
                  <td>
                    {e ? (
                      <input className="small" value={e.plan} onChange={(x) => setEdit({ ...edit, [d]: { ...e, plan: x.target.value } })} />
                    ) : (
                      <span>{s ? formatDuration(s.plan_minutes) : '–'}</span>
                    )}
                  </td>
                  <td>
                    {e ? (
                      <input className="small" placeholder="z. B. Tausch mit MA-03" value={e.note}
                        onChange={(x) => setEdit({ ...edit, [d]: { ...e, note: x.target.value } })} />
                    ) : (
                      <>
                        {s?.note}
                        {s?.is_override && <span className="badge">geändert</span>}
                      </>
                    )}
                  </td>
                  <td className="actions">
                    {e ? (
                      <>
                        <button className="link" onClick={() => saveDay(d)}>OK</button>
                        <button className="link" onClick={() => { const n = { ...edit }; delete n[d]; setEdit(n); }}>×</button>
                      </>
                    ) : (
                      <>
                        <button className="link" onClick={() => setEdit({ ...edit, [d]: { plan: formatDuration(s?.plan_minutes ?? 0), note: s?.note ?? '' } })}>ändern</button>
                        {s?.is_override && !released.has(month) && <button className="link" onClick={() => reset(d)}>zurücksetzen</button>}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr><td>Summe</td><td colSpan={3}><strong>{formatDuration(sum)} h</strong></td></tr>
          </tfoot>
        </table>
      )}
      {msg && <p className="note">{msg}</p>}
    </div>
  );
}
