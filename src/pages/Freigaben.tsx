import { useCallback, useEffect, useState } from 'react';
import { acknowledgeMonth, loadReleasedMonth, loadReleasedYear } from '../lib/api';
import { computeMonth } from '../lib/calc';
import { formatDe, MONATE, todayIso, weekdayShort } from '../lib/dates';
import { errorText } from '../lib/errors';
import { formatEuro } from '../lib/minijob';
import { formatDuration } from '../lib/time';
import { buildMonthSheet } from '../lib/export/monthSheet';
import ExportButtons from './zeiten/ExportButtons';
import YearCsvButton from './zeiten/YearCsvButton';
import { DAY_TYPE_LABEL, type Employee, type MonthClosing, type ScheduleDay, type TimeEntry } from '../lib/types';

interface Detail {
  emp: Employee;
  closing: MonthClosing;
  schedule: ScheduleDay[];
  entries: TimeEntry[];
}

export default function Freigaben() {
  const today = todayIso();
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [emps, setEmps] = useState<Employee[]>([]);
  const [closings, setClosings] = useState<MonthClosing[] | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setClosings(null);
    const d = await loadReleasedYear(year);
    setEmps(d.employees);
    setClosings(d.closings);
  }, [year]);

  useEffect(() => {
    load().catch((e) => setMsg(errorText(e)));
  }, [load]);

  const pseudo = (id: string) => emps.find((e) => e.id === id)?.pseudonym ?? '?';

  async function open(c: MonthClosing) {
    const emp = emps.find((e) => e.id === c.employee_id)!;
    const d = await loadReleasedMonth(c.employee_id, c.year, c.month);
    setDetail({ emp, closing: c, ...d });
  }

  async function ack(list: MonthClosing[]) {
    setBusy(true);
    setMsg(null);
    try {
      for (const c of list) await acknowledgeMonth(c.employee_id, c.year, c.month);
      await load();
      setMsg(list.length === 1 ? 'Eingang bestätigt.' : `Eingang für ${list.length} Personen bestätigt.`);
      if (detail) setDetail(null);
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (detail) {
    const s = detail.closing.summary;
    const m = computeMonth(detail.closing.year, detail.closing.month, detail.schedule, detail.entries,
      s?.carry_in_min ?? 0, today);
    return (
      <div className="stack">
        <button className="link" onClick={() => setDetail(null)}>← Übersicht</button>
        <h2>{detail.emp.pseudonym} – {MONATE[detail.closing.month - 1]} {detail.closing.year}</h2>
        <p className="note">
          Freigegeben am {formatDe(detail.closing.released_at!.slice(0, 10))}
          {detail.closing.acknowledged_at ? `, Eingang bestätigt am ${formatDe(detail.closing.acknowledged_at.slice(0, 10))}` : ''}.
        </p>
        {s && (
          <section className="card">
            <dl className="sums">
              <dt>Ist</dt><dd>{formatDuration(s.ist_min)}</dd>
              <dt>Soll</dt><dd>{formatDuration(s.soll_min)}</dd>
              <dt>Differenz</dt><dd className={s.diff_min < 0 ? 'neg' : 'pos'}>{formatDuration(s.diff_min, true)}</dd>
              <dt>Übertrag Vormonat</dt><dd>{formatDuration(s.carry_in_min, true)}</dd>
              <dt><strong>Saldo</strong></dt><dd><strong>{formatDuration(s.carry_out_min, true)}</strong></dd>
              <dt>Urlaubstage im Monat</dt><dd>{s.urlaub_tage}</dd>
              {s.verdienst_cent !== null && <><dt>Verdienst Monat</dt><dd>{formatEuro(s.verdienst_cent)}</dd></>}
              {s.verdienst_jahr_cent !== null && <><dt>Verdienst Jahr bis hier</dt><dd>{formatEuro(s.verdienst_jahr_cent!)}</dd></>}
            </dl>
          </section>
        )}
        <div className="scroll"><table className="plan">
          <thead><tr><th>Tag</th><th>Art</th><th>Zeiten</th><th>Ist</th><th>Soll</th><th>Diff.</th></tr></thead>
          <tbody>
            {m.days.map((d) => {
              const e = d.entry;
              const times = e?.start1 ? `${e.start1}–${e.end1}${e.start2 ? `, ${e.start2}–${e.end2}` : ''}` : '';
              return (
                <tr key={d.day} className={d.plan === 0 && !e ? 'off' : ''}>
                  <td>{weekdayShort(d.day)} {formatDe(d.day).slice(0, 6)}</td>
                  <td>{e ? DAY_TYPE_LABEL[e.day_type] : d.isHoliday ? 'Feiertag' : ''}</td>
                  <td>{times}{e?.note && <div className="hint">{e.note}</div>}</td>
                  <td>{e || d.soll ? formatDuration(d.ist) : ''}</td>
                  <td>{d.soll ? formatDuration(d.soll) : ''}</td>
                  <td className={d.diff < 0 ? 'neg' : d.diff > 0 ? 'pos' : ''}>{d.diff ? formatDuration(d.diff, true) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        {!detail.closing.acknowledged_at && (
          <button className="primary" disabled={busy} onClick={() => ack([detail.closing])}>Eingang bestätigen</button>
        )}
        <ExportButtons make={() => buildMonthSheet({
          pseudonym: detail.emp.pseudonym, year: detail.closing.year, month: detail.closing.month,
          days: m.days, carryIn: s?.carry_in_min ?? 0, closing: detail.closing,
        })} />
        {msg && <p className="note">{msg}</p>}
      </div>
    );
  }

  const byMonth = new Map<number, MonthClosing[]>();
  for (const c of closings ?? []) byMonth.set(c.month, [...(byMonth.get(c.month) ?? []), c]);
  const months = [...byMonth.keys()].sort((a, b) => b - a);

  return (
    <div className="stack">
      <div className="monthnav">
        <button onClick={() => setYear(year - 1)} aria-label="Vorjahr">‹</button>
        <h2>Freigaben {year}</h2>
        <button onClick={() => setYear(year + 1)} aria-label="Folgejahr">›</button>
      </div>
      <p className="hint">Hier stehen nur Monate, die die Leitung freigegeben hat. Namen sieht nur die Leitung.</p>

      {!closings ? <p className="hint">Lade …</p> : months.length === 0 ? (
        <p className="note">Für {year} ist noch kein Monat freigegeben.</p>
      ) : months.map((mo) => {
        const list = byMonth.get(mo)!.sort((a, b) => pseudo(a.employee_id).localeCompare(pseudo(b.employee_id)));
        const open_ = list.filter((c) => !c.acknowledged_at);
        return (
          <section key={mo} className="card">
            <div className="row spread">
              <h3>{MONATE[mo - 1]} {year}</h3>
              <span className="hint">{list.length} freigegeben · {list.length - open_.length} bestätigt</span>
            </div>
            <div className="scroll"><table className="plan">
              <thead><tr><th>Person</th><th>Ist</th><th>Soll</th><th>Saldo</th><th>Urlaub</th><th>Verdienst</th><th>Eingang</th></tr></thead>
              <tbody>
                {list.map((c) => {
                  const s = c.summary;
                  return (
                    <tr key={c.employee_id} onClick={() => open(c).catch((e) => setMsg(errorText(e)))}>
                      <td><strong>{pseudo(c.employee_id)}</strong></td>
                      <td>{s ? formatDuration(s.ist_min) : '–'}</td>
                      <td>{s ? formatDuration(s.soll_min) : '–'}</td>
                      <td className={s && s.carry_out_min < 0 ? 'neg' : ''}>{s ? formatDuration(s.carry_out_min, true) : '–'}</td>
                      <td>{s?.urlaub_tage || ''}</td>
                      <td>{s?.verdienst_cent != null ? formatEuro(s.verdienst_cent) : ''}</td>
                      <td>{c.acknowledged_at ? `✓ ${formatDe(c.acknowledged_at.slice(0, 10)).slice(0, 6)}` : <span className="warn">offen</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
            {open_.length > 0 && (
              <button disabled={busy} onClick={() => ack(open_)}>
                Eingang für {open_.length === list.length ? 'alle' : `${open_.length} offene`} bestätigen
              </button>
            )}
          </section>
        );
      })}
      {msg && <p className="note" role="status">{msg}</p>}
      {months.length > 0 && <YearCsvButton year={year} mode="vorstand" />}
    </div>
  );
}
