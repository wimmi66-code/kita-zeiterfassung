import { useCallback, useEffect, useState } from 'react';
import { loadIdentityMap, loadParameters, loadYearData, reviewableEmployees, type YearData } from '../lib/api';
import { computeYear } from '../lib/calc';
import { formatDe, makeDate, MONATE, todayIso, weekdayShort } from '../lib/dates';
import { deadlineState, releaseDeadline, type DeadlineState } from '../lib/deadline';
import { errorText } from '../lib/errors';
import { checkLimit, earningsCents, monthlyLimit, paramAt } from '../lib/minijob';
import { termsFor } from '../lib/schedule';
import { formatDuration } from '../lib/time';
import { isMinijob, STATUS_LABEL, type Employee, type MonthStatus, type Parameter } from '../lib/types';
import Review from './Review';

interface Row {
  emp: Employee;
  name: string | null;
  status: MonthStatus;
  diff: number;
  saldo: number;
  missing: number;
  limit: 'ok' | 'warnung' | 'ueberschritten' | 'keine_grenze' | null;
  acknowledged: boolean;
}

const FRIST_LABEL: Record<DeadlineState, string> = {
  erledigt: 'erledigt', ok: 'offen', bald: 'Frist bald', ueberfaellig: 'überfällig',
};

function prevMonth(today: string) {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
}

export default function Team() {
  const today = todayIso();
  const [ym, setYm] = useState(() => prevMonth(today));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [params, setParams] = useState<Parameter[]>([]);
  const [open, setOpen] = useState<{ emp: Employee; name: string | null } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    const [emps, names, prm] = await Promise.all([reviewableEmployees(), loadIdentityMap(), loadParameters()]);
    setParams(prm);
    const active = emps.filter((e) => e.active);
    const data: YearData[] = await Promise.all(active.map((e) => loadYearData(e.id, ym.year)));
    setRows(active.map((emp, i) => {
      const d = data[i];
      const y = computeYear(ym.year, d.schedule, d.entries, d.balance, today);
      const m = y[ym.month - 1];
      const c = d.closings.find((x) => x.month === ym.month);
      const t = termsFor(d.terms, makeDate(ym.year, ym.month, 15));
      let limit: Row['limit'] = null;
      if (t && isMinijob(t.kind)) {
        const warn = paramAt(prm, 'minijob_warnschwelle', makeDate(ym.year, ym.month, 1)) ?? 0.9;
        limit = checkLimit(earningsCents(m.days, d.terms), monthlyLimit(prm, ym.year, ym.month), warn).level;
      }
      return {
        emp, name: names.get(emp.id) ?? null,
        status: c?.status ?? 'offen',
        diff: m.diff, saldo: m.carryOut,
        missing: m.days.filter((x) => x.missing).length,
        limit, acknowledged: !!c?.acknowledged_at,
      };
    }));
  }, [ym.year, ym.month, today]);

  useEffect(() => {
    if (!open) load().catch((e) => setMsg(errorText(e)));
  }, [load, open]);

  function shift(delta: number) {
    setYm(({ year, month }) => {
      const t = year * 12 + (month - 1) + delta;
      return { year: Math.floor(t / 12), month: (t % 12) + 1 };
    });
  }

  if (open) {
    return <Review emp={open.emp} name={open.name} year={ym.year} month={ym.month} params={params}
      onBack={() => setOpen(null)} />;
  }

  const n = paramAt(params, 'freigabe_frist_werktag', makeDate(ym.year, ym.month, 1)) ?? 5;
  const deadline = releaseDeadline(ym.year, ym.month, n);
  const counts = rows ? {
    released: rows.filter((r) => r.status === 'freigegeben').length,
    submitted: rows.filter((r) => r.status === 'eingereicht').length,
  } : null;

  return (
    <div className="stack">
      <div className="monthnav">
        <button onClick={() => shift(-1)} aria-label="Vormonat">‹</button>
        <h2>{MONATE[ym.month - 1]} {ym.year}</h2>
        <button onClick={() => shift(1)} aria-label="Folgemonat">›</button>
      </div>
      <p className="note">
        Freigabe bis <strong>{weekdayShort(deadline)}, {formatDe(deadline)}</strong> ({n}. Werktag).
        {counts && <> {counts.released} von {rows!.length} freigegeben, {counts.submitted} warten auf Prüfung.</>}
      </p>

      {!rows ? <p className="hint">Lade …</p> : rows.length === 0 ? (
        <p className="hint">Keine Personen zur Prüfung. Bitte zuerst unter Stammdaten Personen anlegen.</p>
      ) : (
        <ul className="team">
          {rows.map((r) => {
            const st = deadlineState(deadline, today, r.status === 'freigegeben');
            return (
              <li key={r.emp.id}>
                <button className={`team-row f-${st}`} onClick={() => setOpen({ emp: r.emp, name: r.name })}>
                  <div className="row spread">
                    <strong>{r.emp.pseudonym}{r.name && <span className="hint"> · {r.name}</span>}</strong>
                    <span className={`status s-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                  </div>
                  <div className="row spread hint">
                    <span>Monat {formatDuration(r.diff, true)} · Saldo <span className={r.saldo < 0 ? 'neg' : ''}>{formatDuration(r.saldo, true)}</span></span>
                    <span className={st === 'ueberfaellig' ? 'neg' : st === 'bald' ? 'warn' : ''}>
                      {r.status === 'freigegeben' ? (r.acknowledged ? 'Eingang bestätigt' : 'freigegeben') : FRIST_LABEL[st]}
                    </span>
                  </div>
                  {(r.missing > 0 || (r.limit && r.limit !== 'ok')) && (
                    <div className="hint">
                      {r.missing > 0 && <span className="neg">{r.missing} Tage ohne Eintrag </span>}
                      {r.limit === 'warnung' && <span className="warn">Minijob über 90 % </span>}
                      {r.limit === 'ueberschritten' && <span className="neg">Minijob-Grenze überschritten</span>}
                      {r.limit === 'keine_grenze' && <span className="warn">keine Verdienstgrenze für {ym.year} hinterlegt</span>}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {msg && <p className="error">{msg}</p>}
    </div>
  );
}
