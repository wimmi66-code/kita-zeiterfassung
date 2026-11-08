import { useEffect, useRef, useState } from 'react';
import { computeBreak } from '../../lib/breaks';
import { computeDay } from '../../lib/calc';
import { formatDe, weekdayShort, type IsoDate } from '../../lib/dates';
import { errorText } from '../../lib/errors';
import { formatDuration } from '../../lib/time';
import { DAY_TYPE_LABEL, type DayType, type ScheduleDay, type TimeEntry } from '../../lib/types';

interface Props {
  employeeId: string;
  day: IsoDate;
  schedule: ScheduleDay | undefined;
  entry: TimeEntry | undefined;
  today: IsoDate;
  editable: boolean;
  /** Korrekturmodus der prüfenden Person: verlangt eine Begründung */
  needsReason?: boolean;
  onSave: (e: TimeEntry, reason?: string) => Promise<void>;
  onDelete: (day: IsoDate, reason?: string) => Promise<void>;
  onClose: () => void;
}

const empty = (employee_id: string, day: IsoDate, holiday: boolean): TimeEntry => ({
  employee_id, day, day_type: holiday ? 'feiertag' : 'arbeit',
  start1: null, end1: null, start2: null, end2: null, break_minutes: null, note: null,
});

const WITH_TIMES: DayType[] = ['arbeit', 'halber_urlaub'];

export default function DayEditor(p: Props) {
  const [e, setE] = useState<TimeEntry>(p.entry ?? empty(p.employeeId, p.day, !!p.schedule?.is_holiday));
  const [second, setSecond] = useState(!!p.entry?.start2);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [p.day]);

  useEffect(() => {
    setE(p.entry ?? empty(p.employeeId, p.day, !!p.schedule?.is_holiday));
    setSecond(!!p.entry?.start2);
    setReason('');
    setMsg(null);
  }, [p.day, p.entry, p.employeeId, p.schedule]);

  const times = WITH_TIMES.includes(e.day_type);
  const clean: TimeEntry = times ? { ...e, start2: second ? e.start2 : null, end2: second ? e.end2 : null }
    : { ...e, start1: null, end1: null, start2: null, end2: null, break_minutes: null };
  const r = computeDay(p.day, p.schedule, clean, p.today);
  const gap = times ? computeBreak(clean, clean.break_minutes).gapCredit : 0;

  const problems: string[] = [];
  if (times) {
    if (!!clean.start1 !== !!clean.end1) problems.push('Block 1: Kommen und Gehen angeben.');
    if (clean.start1 && clean.end1 && clean.end1 <= clean.start1) problems.push('Block 1: Gehen muss nach Kommen liegen.');
    if (second && (!clean.start2 || !clean.end2)) problems.push('Block 2: Kommen und Gehen angeben oder Block entfernen.');
    if (clean.start2 && clean.end2 && clean.end2 <= clean.start2) problems.push('Block 2: Gehen muss nach Kommen liegen.');
    if (clean.start2 && clean.end1 && clean.start2 < clean.end1) problems.push('Block 2 muss nach Block 1 beginnen.');
    if (e.day_type === 'arbeit' && !clean.start1) problems.push('Kommen und Gehen eintragen oder eine andere Tagesart wählen.');
  }
  if (p.needsReason && reason.trim().length < 5) problems.push('Begründung für die Korrektur angeben (mind. 5 Zeichen).');

  const set = (k: keyof TimeEntry, v: string | number | null) => setE({ ...e, [k]: v === '' ? null : v });

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      p.onClose();
    } catch (err) {
      setMsg(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const ro = !p.editable;

  return (
    <div className="card inset day-editor" ref={ref}>
      <div className="row spread">
        <h3>{weekdayShort(p.day)}, {formatDe(p.day)}</h3>
        <button className="link" onClick={p.onClose}>schließen</button>
      </div>
      {p.schedule?.is_holiday && <p className="hint">Feiertag: {p.schedule.note}</p>}
      {p.schedule?.is_override && p.schedule.note && <p className="hint">Dienstplan: {p.schedule.note}</p>}
      <p className="hint">Plan: {formatDuration(r.plan)} h
        {p.schedule?.fixed_start && ` (${p.schedule.fixed_start.slice(0, 5)}–${p.schedule.fixed_end?.slice(0, 5)})`}
      </p>

      <label>Tagesart
        <select value={e.day_type} disabled={ro} onChange={(x) => set('day_type', x.target.value)}>
          {Object.entries(DAY_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>

      {times && (
        <>
          <div className="grid2 times">
            <label>Kommen<input type="time" disabled={ro} value={e.start1 ?? ''} onChange={(x) => set('start1', x.target.value)} /></label>
            <label>Gehen<input type="time" disabled={ro} value={e.end1 ?? ''} onChange={(x) => set('end1', x.target.value)} /></label>
          </div>
          {second ? (
            <>
              <div className="grid2 times">
                <label>Kommen (2)<input type="time" disabled={ro} value={e.start2 ?? ''} onChange={(x) => set('start2', x.target.value)} /></label>
                <label>Gehen (2)<input type="time" disabled={ro} value={e.end2 ?? ''} onChange={(x) => set('end2', x.target.value)} /></label>
              </div>
              {!ro && <button className="link" onClick={() => setSecond(false)}>zweiten Block entfernen</button>}
            </>
          ) : (
            !ro && <button className="link" onClick={() => setSecond(true)}>+ zweiter Block (geteilter Dienst)</button>
          )}
          <label>Pause in Minuten (leer = gesetzliche Mindestpause)
            <input inputMode="numeric" disabled={ro} placeholder={String(r.autoBreak)}
              value={e.break_minutes ?? ''} onChange={(x) => set('break_minutes', x.target.value === '' ? null : Math.max(0, Number(x.target.value) || 0))} />
          </label>
        </>
      )}

      <label>Bemerkung
        <input disabled={ro} value={e.note ?? ''} maxLength={500} onChange={(x) => set('note', x.target.value)} />
      </label>

      <dl className="sums">
        {times && <><dt>Pause</dt><dd>{r.breakDeducted} min{r.breakDeducted === r.autoBreak && r.autoBreak > 0 ? ' (gesetzlich)' : ''}
          {gap > 0 && ` + ${gap} min zwischen den Blöcken`}</dd></>}
        <dt>Ist</dt><dd>{formatDuration(r.ist)}</dd>
        <dt>Soll</dt><dd>{formatDuration(r.soll)}</dd>
        <dt>Differenz</dt><dd className={r.diff < 0 ? 'neg' : r.diff > 0 ? 'pos' : ''}>{formatDuration(r.diff, true)}</dd>
      </dl>

      {p.needsReason && p.editable && (
        <label>Begründung der Korrektur (Pflicht)
          <input value={reason} onChange={(x) => setReason(x.target.value)} />
        </label>
      )}

      {p.editable && problems.length > 0 && <ul className="hint">{problems.map((x) => <li key={x}>{x}</li>)}</ul>}
      {msg && <p className="error">{msg}</p>}
      {p.editable ? (
        <div className="row">
          <button className="primary" disabled={busy || problems.length > 0}
            onClick={() => act(() => p.onSave(clean, p.needsReason ? reason : undefined))}>Speichern</button>
          {p.entry && (
            <button disabled={busy || (p.needsReason && reason.trim().length < 5)}
              onClick={() => window.confirm('Eintrag löschen?') && act(() => p.onDelete(p.day, p.needsReason ? reason : undefined))}>
              Löschen
            </button>
          )}
        </div>
      ) : (
        <p className="hint">Dieser Monat ist gesperrt.</p>
      )}
    </div>
  );
}
