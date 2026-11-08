import { useState } from 'react';
import { saveTerms } from '../../lib/api';
import { isoWeekday } from '../../lib/dates';
import { errorText } from '../../lib/errors';
import { belowMinimumWage } from '../../lib/minijob';
import { minutesBetween } from '../../lib/schedule';
import { formatDuration, parseDuration } from '../../lib/time';
import { MODEL_LABEL, isMinijob, type EmploymentTerms, type ModelKind, type Parameter } from '../../lib/types';

const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

interface Props {
  employeeId: string;
  initial: EmploymentTerms | null;
  params: Parameter[];
  onSaved: () => void;
  onCancel: () => void;
}

/** Wochenstunden im Mittel; ein 14-tägiger Montag zählt halb. */
export function weeklyAverage(plan: number[], biweeklyMonday: boolean): number {
  return plan.reduce((a, m, i) => a + (i === 0 && biweeklyMonday ? m / 2 : m), 0);
}

export default function TermsForm({ employeeId, initial, params, onSaved, onCancel }: Props) {
  const [validFrom, setValidFrom] = useState(initial?.valid_from ?? '');
  const [kind, setKind] = useState<ModelKind>(initial?.kind ?? 'vollzeit');
  const [plan, setPlan] = useState<string[]>(
    (initial?.plan_minutes ?? [0, 0, 0, 0, 0, 0, 0]).map((m) => (m ? formatDuration(m) : '')));
  const [monday, setMonday] = useState(initial?.monday_biweekly_from ?? '');
  const [fixStart, setFixStart] = useState(initial?.fixed_start?.slice(0, 5) ?? '');
  const [fixEnd, setFixEnd] = useState(initial?.fixed_end?.slice(0, 5) ?? '');
  const [wage, setWage] = useState(initial?.hourly_wage_cents ? (initial.hourly_wage_cents / 100).toFixed(2).replace('.', ',') : '');
  const [vacation, setVacation] = useState(initial?.vacation_days_per_year?.toString().replace('.', ',') ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const planMin = plan.map((p) => parseDuration(p) ?? 0);
  const planInvalid = plan.some((p) => p.trim() !== '' && parseDuration(p) === null);
  const biweekly = kind === 'stellenteilung' && !!monday;
  const weekly = weeklyAverage(planMin, biweekly);
  const wageCents = wage.trim() ? Math.round(Number(wage.replace(',', '.')) * 100) : null;
  const vacDays = vacation.trim() ? Number(vacation.replace(',', '.')) : null;

  const draft: EmploymentTerms = {
    id: initial?.id,
    employee_id: employeeId,
    valid_from: validFrom,
    kind,
    weekly_minutes: kind === 'minijob_vertretung' ? null : Math.round(weekly),
    plan_minutes: kind === 'minijob_vertretung' ? [0, 0, 0, 0, 0, 0, 0] : planMin,
    monday_biweekly_from: kind === 'stellenteilung' && monday ? monday : null,
    fixed_start: kind === 'minijob_alltagshilfe' && fixStart ? fixStart : null,
    fixed_end: kind === 'minijob_alltagshilfe' && fixEnd ? fixEnd : null,
    vacation_days_per_year: vacDays,
    hourly_wage_cents: isMinijob(kind) ? wageCents : null,
  };

  const problems: string[] = [];
  if (!validFrom) problems.push('Gültig ab fehlt.');
  if (planInvalid) problems.push('Planstunden bitte als h:mm eingeben, z. B. 7:48.');
  if (kind === 'stellenteilung' && monday && isoWeekday(monday) !== 1) problems.push('„Montag 14-tägig ab“ muss ein Montag sein.');
  if (isMinijob(kind) && (!wageCents || wageCents <= 0)) problems.push('Stundenlohn fehlt.');
  if (kind === 'minijob_alltagshilfe' && (!fixStart || !fixEnd || minutesBetween(fixStart, fixEnd) <= 0)) problems.push('Einsatzzeit von–bis fehlt.');
  if (vacDays !== null && (!Number.isFinite(vacDays) || vacDays < 0)) problems.push('Urlaubstage ungültig.');
  const minWageWarn = isMinijob(kind) && wageCents && validFrom && belowMinimumWage(draft, params);

  function setDay(i: number, v: string) {
    setPlan((p) => p.map((x, j) => (j === i ? v : x)));
  }
  function copyMondayToWeek() {
    setPlan((p) => p.map((x, j) => (j < 5 ? p[0] : x)));
  }
  function applyFixed() {
    const m = minutesBetween(fixStart, fixEnd);
    setPlan((p) => p.map((x, j) => (j < 5 ? formatDuration(m) : x)));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await saveTerms(draft);
      onSaved();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card inset">
      <h3>{initial ? 'Modellversion bearbeiten' : 'Neue Modellversion'}</h3>
      <div className="grid2">
        <label>Gültig ab
          <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </label>
        <label>Modell
          <select value={kind} onChange={(e) => setKind(e.target.value as ModelKind)}>
            {Object.entries(MODEL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>

      {kind === 'minijob_alltagshilfe' && (
        <div className="grid2">
          <label>Einsatz von
            <input type="time" value={fixStart} onChange={(e) => setFixStart(e.target.value)} />
          </label>
          <label>bis
            <input type="time" value={fixEnd} onChange={(e) => setFixEnd(e.target.value)} />
          </label>
          <button type="button" onClick={applyFixed} disabled={!fixStart || !fixEnd}>Als Planzeit Mo–Fr übernehmen</button>
        </div>
      )}

      {kind !== 'minijob_vertretung' && (
        <fieldset>
          <legend>Planstunden je Wochentag (h:mm)</legend>
          <div className="weekgrid">
            {TAGE.map((t, i) => (
              <label key={t}>{t}
                <input inputMode="decimal" placeholder="0:00" value={plan[i]} onChange={(e) => setDay(i, e.target.value)} />
              </label>
            ))}
          </div>
          <button type="button" className="link" onClick={copyMondayToWeek}>Wert vom Montag auf Mo–Fr übertragen</button>
          {kind === 'stellenteilung' && (
            <label>Montag nur 14-tägig, erstmals am
              <input type="date" value={monday} onChange={(e) => setMonday(e.target.value)} />
              <span className="hint">Leer lassen, wenn der Montag jede Woche gilt. Den Montag oben trotzdem mit Planstunden füllen.</span>
            </label>
          )}
          <p className="hint">Durchschnitt pro Woche: <strong>{formatDuration(weekly)} h</strong></p>
        </fieldset>
      )}
      {kind === 'minijob_vertretung' && <p className="hint">Keine Sollstunden. Einsätze werden nach Bedarf erfasst.</p>}

      <div className="grid2">
        {isMinijob(kind) && (
          <label>Stundenlohn (€)
            <input inputMode="decimal" placeholder="z. B. 15,00" value={wage} onChange={(e) => setWage(e.target.value)} />
          </label>
        )}
        <label>Urlaubstage pro Jahr
          <input inputMode="decimal" value={vacation} onChange={(e) => setVacation(e.target.value)} />
        </label>
      </div>

      {minWageWarn && <p className="warn">Der Stundenlohn liegt unter dem Mindestlohn, der an diesem Datum gilt.</p>}
      {problems.length > 0 && <ul className="hint">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      {msg && <p className="error">{msg}</p>}
      <div className="row">
        <button className="primary" disabled={busy || problems.length > 0} onClick={save}>Speichern</button>
        <button onClick={onCancel}>Abbrechen</button>
      </div>
    </div>
  );
}
