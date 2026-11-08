import { useMemo, useState } from 'react';
import type { YearData } from '../../lib/api';
import { computeYear, vacationAccount, type DayResult } from '../../lib/calc';
import { formatDe, isoWeekday, makeDate, MONATE, type IsoDate } from '../../lib/dates';
import {
  checkLimit, earningsCents, formatEuro, monthlyLimit, paramAt, recordFlags, yearlyLimit,
} from '../../lib/minijob';
import { termsFor } from '../../lib/schedule';
import { formatDuration } from '../../lib/time';
import { DAY_TYPE_LABEL, isMinijob, STATUS_LABEL, type MonthStatus, type TimeEntry } from '../../lib/types';
import DayEditor from './DayEditor';

interface Props {
  employeeId: string;
  year: number;
  month: number;
  data: YearData;
  today: IsoDate;
  /** Darf der Betrachter Einträge dieses Monats bearbeiten? */
  editable: boolean;
  /** Korrekturmodus (Leitung/Admin): Begründung verlangen */
  correction?: boolean;
  onSave: (e: TimeEntry, reason?: string) => Promise<void>;
  onDelete: (day: IsoDate, reason?: string) => Promise<void>;
}

const KURZ: Record<string, string> = {
  urlaub: 'U', halber_urlaub: '½U', krank: 'K', feiertag: 'F', ueberstundenausgleich: 'ÜA',
};

export function monthStatus(data: YearData, month: number): MonthStatus {
  return data.closings.find((c) => c.month === month)?.status ?? 'offen';
}

export default function MonthView(p: Props) {
  const [selected, setSelected] = useState<IsoDate | null>(null);
  const { data, year, month, today } = p;

  const yearRes = useMemo(
    () => computeYear(year, data.schedule, data.entries, data.balance, today),
    [year, data, today]);
  const m = yearRes[month - 1];
  const closing = data.closings.find((c) => c.month === month);
  const status: MonthStatus = closing?.status ?? 'offen';
  const vac = vacationAccount(year, data.terms, data.entries, data.balance);
  const sMap = new Map(data.schedule.map((s) => [s.day, s]));
  const eMap = new Map(data.entries.map((e) => [e.day, e]));

  // Minijob
  const monthTerms = termsFor(data.terms, makeDate(year, month, 15)) ?? termsFor(data.terms, m.days.at(-1)!.day);
  const minijob = monthTerms && isMinijob(monthTerms.kind);
  let money: null | {
    month: ReturnType<typeof checkLimit>; year: ReturnType<typeof checkLimit>;
  } = null;
  let flags: ReturnType<typeof recordFlags> = [];
  if (minijob) {
    const warn = paramAt(data.params, 'minijob_warnschwelle', makeDate(year, month, 1)) ?? 0.9;
    const monthDaysAll: DayResult[] = m.days;
    const ytd = yearRes.slice(0, month).flatMap((x) => x.days);
    money = {
      month: checkLimit(earningsCents(monthDaysAll, data.terms), monthlyLimit(data.params, year, month), warn),
      year: checkLimit(earningsCents(ytd, data.terms), yearlyLimit(data.params, year), warn),
    };
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const fristTage = paramAt(data.params, 'milog_erfassungsfrist_tage', makeDate(year, month, 1)) ?? 7;
    flags = recordFlags(
      data.schedule.filter((s) => s.day.startsWith(prefix)),
      data.entries.filter((e) => e.day.startsWith(prefix)), today, fristTage);
  }
  const flagMap = new Map(flags.map((f) => [f.day, f]));

  const firstWd = isoWeekday(m.days[0].day);
  const missing = m.days.filter((d) => d.missing);
  const sel = selected ? m.days.find((d) => d.day === selected) : null;

  return (
    <div className="stack">
      <div className="row spread">
        <span className={`status s-${status}`}>{STATUS_LABEL[status]}</span>
        {closing?.released_at && <span className="hint">freigegeben am {formatDe(closing.released_at.slice(0, 10))}</span>}
      </div>
      {status === 'zurueckgegeben' && closing?.return_reason && (
        <p className="note warnbox">Zurückgegeben: {closing.return_reason}</p>
      )}

      {/* Kalender */}
      <div className="cal" role="grid" aria-label={`${MONATE[month - 1]} ${year}`}>
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((t) => <div key={t} className="cal-h">{t}</div>)}
        {Array.from({ length: firstWd - 1 }, (_, i) => <div key={`x${i}`} />)}
        {m.days.map((d) => {
          const e = d.entry;
          const f = flagMap.get(d.day);
          const cls = [
            'cal-d',
            d.isHoliday ? 'hol' : '',
            d.plan === 0 && !e ? 'free' : '',
            e ? 'done' : '',
            d.missing ? 'miss' : '',
            f?.state === 'ueberfaellig' || f?.state === 'verspaetet' ? 'late' : '',
            d.day === today ? 'today' : '',
            d.day === selected ? 'sel' : '',
          ].join(' ');
          return (
            <button key={d.day} className={cls} onClick={() => setSelected(d.day)}>
              <span className="n">{Number(d.day.slice(8))}</span>
              <span className="v">
                {e ? (KURZ[e.day_type] ?? formatDuration(d.ist)) : d.isHoliday ? 'F' : d.plan ? '·' : ''}
              </span>
            </button>
          );
        })}
      </div>
      <p className="hint legend">
        <span className="lg done" /> erfasst <span className="lg miss" /> fehlt <span className="lg hol" /> Feiertag
        {minijob && <><span className="lg late" /> Frist § 17 MiLoG</>}
      </p>

      {sel && (
        <DayEditor employeeId={p.employeeId} day={sel.day} schedule={sMap.get(sel.day)} entry={eMap.get(sel.day)}
          today={today} editable={p.editable} needsReason={p.correction}
          onSave={p.onSave} onDelete={p.onDelete} onClose={() => setSelected(null)} />
      )}

      {/* Monatsübersicht */}
      <section className="card">
        <h3>Monatsübersicht</h3>
        <dl className="sums">
          <dt>Ist</dt><dd>{formatDuration(m.ist)}</dd>
          <dt>Soll</dt><dd>{formatDuration(m.soll)}</dd>
          <dt>Differenz Monat</dt><dd className={m.diff < 0 ? 'neg' : 'pos'}>{formatDuration(m.diff, true)}</dd>
          <dt>Übertrag Vormonat</dt><dd>{formatDuration(m.carryIn, true)}</dd>
          <dt><strong>Saldo</strong></dt><dd><strong className={m.carryOut < 0 ? 'neg' : 'pos'}>{formatDuration(m.carryOut, true)}</strong></dd>
        </dl>
        {month === 1 && <p className="hint">Übertrag Vorjahr: {formatDuration(data.balance?.carry_minutes ?? 0, true)}</p>}
        {makeDate(year, month + 1, 0) > today && <p className="hint">Stand bis heute; künftige Tage zählen noch nicht.</p>}
      </section>

      <section className="card">
        <h3>Urlaub {year}</h3>
        <dl className="sums">
          <dt>Anspruch</dt><dd>{vac.entitlement}</dd>
          <dt>Rest Vorjahr</dt><dd>{vac.carry}</dd>
          <dt>Genommen/geplant</dt><dd>{vac.taken}</dd>
          <dt><strong>Rest</strong></dt><dd><strong>{vac.rest}</strong></dd>
        </dl>
      </section>

      {money && (
        <section className="card">
          <h3>Minijob</h3>
          <dl className="sums">
            <dt>Verdienst {MONATE[month - 1]}</dt><dd>{formatEuro(money.month.earned)}</dd>
            <dt>Grenze Monat</dt><dd>{formatEuro(money.month.limit)}</dd>
            <dt>Verdienst {year} bis {MONATE[month - 1]}</dt><dd>{formatEuro(money.year.earned)}</dd>
            <dt>Grenze Jahr</dt><dd>{formatEuro(money.year.limit)}</dd>
          </dl>
          <div className="meter" aria-label="Anteil an der Monatsgrenze">
            <div className={`fill ${money.month.level}`} style={{ width: `${Math.min(100, money.month.share * 100)}%` }} />
          </div>
          {money.month.level === 'keine_grenze' && <p className="warn">Für {year} ist keine Verdienstgrenze hinterlegt (Tabelle parameters).</p>}
          {money.month.level === 'warnung' && <p className="warn">Über 90 % der monatlichen Verdienstgrenze.</p>}
          {money.month.level === 'ueberschritten' && <p className="error">Monatliche Verdienstgrenze überschritten. Bitte mit der Leitung klären.</p>}
          {(money.year.level === 'warnung' || money.year.level === 'ueberschritten') && <p className="warn">Jahresverdienst: {Math.round(money.year.share * 100)} % der Jahresgrenze.</p>}
          {flags.length > 0 && (
            <>
              <h4>Aufzeichnungsfrist (§ 17 MiLoG)</h4>
              <ul className="hint">
                {flags.map((f) => (
                  <li key={f.day + f.state}>
                    {formatDe(f.day)}: {f.state === 'faellig' ? `noch offen, bis ${formatDe(f.dueBy)} erfassen`
                      : f.state === 'ueberfaellig' ? `Frist am ${formatDe(f.dueBy)} abgelaufen` : 'verspätet erfasst'}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* Tagesliste wie im Excel-Monatsblatt */}
      <details className="card">
        <summary><strong>Tagesliste</strong></summary>
        <table className="plan">
          <thead><tr><th>Tag</th><th>Art</th><th>Ist</th><th>Soll</th><th>Diff.</th></tr></thead>
          <tbody>
            {m.days.map((d) => (
              <tr key={d.day} className={d.plan === 0 && !d.entry ? 'off' : ''} onClick={() => setSelected(d.day)}>
                <td>{formatDe(d.day).slice(0, 6)}</td>
                <td>{d.entry ? DAY_TYPE_LABEL[d.entry.day_type] : d.isHoliday ? 'Feiertag' : d.missing ? <span className="neg">fehlt</span> : ''}</td>
                <td>{d.entry || d.soll ? formatDuration(d.ist) : ''}</td>
                <td>{d.soll ? formatDuration(d.soll) : ''}</td>
                <td className={d.diff < 0 ? 'neg' : d.diff > 0 ? 'pos' : ''}>{d.diff ? formatDuration(d.diff, true) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {missing.length > 0 && status !== 'freigegeben' && (
        <p className="hint">{missing.length} geplante{missing.length === 1 ? 'r Tag' : ' Tage'} ohne Eintrag.</p>
      )}
    </div>
  );
}
