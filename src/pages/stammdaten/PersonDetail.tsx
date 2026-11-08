import { useEffect, useState } from 'react';
import {
  deleteTerms, loadBalance, loadTerms, saveBalance, saveIdentity, setEmployeeActive, type EmployeeRow,
} from '../../lib/api';
import { formatDe } from '../../lib/dates';
import { errorText } from '../../lib/errors';
import { formatEuro } from '../../lib/minijob';
import { formatDuration, parseDuration } from '../../lib/time';
import { MODEL_LABEL, type EmploymentTerms, type Parameter } from '../../lib/types';
import AccountHelp from './AccountHelp';
import ScheduleEditor from './ScheduleEditor';
import TermsForm, { weeklyAverage } from './TermsForm';

interface Props {
  emp: EmployeeRow;
  params: Parameter[];
  onChanged: () => void;
}

const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function termsSummary(t: EmploymentTerms): string {
  const parts: string[] = [MODEL_LABEL[t.kind]];
  if (t.kind !== 'minijob_vertretung') {
    const days = t.plan_minutes
      .map((m, i) => (m > 0 ? `${TAGE[i]}${i === 0 && t.monday_biweekly_from ? '*' : ''} ${formatDuration(m)}` : null))
      .filter(Boolean);
    parts.push(days.join(', '));
    parts.push(`Ø ${formatDuration(weeklyAverage(t.plan_minutes, !!t.monday_biweekly_from))} h/Woche`);
  }
  if (t.monday_biweekly_from) parts.push(`*Mo 14-tägig ab ${formatDe(t.monday_biweekly_from)}`);
  if (t.fixed_start) parts.push(`Einsatz ${t.fixed_start.slice(0, 5)}–${t.fixed_end?.slice(0, 5)}`);
  if (t.hourly_wage_cents) parts.push(`${formatEuro(t.hourly_wage_cents)}/h`);
  if (t.vacation_days_per_year !== null) parts.push(`${t.vacation_days_per_year} Urlaubstage`);
  return parts.join(' · ');
}

export default function PersonDetail({ emp, params, onChanged }: Props) {
  const [first, setFirst] = useState(emp.first_name ?? '');
  const [last, setLast] = useState(emp.last_name ?? '');
  const [terms, setTerms] = useState<EmploymentTerms[]>([]);
  const [form, setForm] = useState<EmploymentTerms | 'new' | null>(null);
  const [year, setYear] = useState(() => Math.max(new Date().getFullYear(), 2027));
  const [carry, setCarry] = useState('');
  const [carryVac, setCarryVac] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  async function reloadTerms() {
    setTerms(await loadTerms(emp.id));
  }

  useEffect(() => {
    setFirst(emp.first_name ?? '');
    setLast(emp.last_name ?? '');
    setForm(null);
    setMsg(null);
    reloadTerms().catch((e) => setMsg(errorText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emp.id]);

  useEffect(() => {
    loadBalance(emp.id, year).then((b) => {
      setCarry(b ? formatDuration(b.carry_minutes) : '0:00');
      setCarryVac(b ? String(b.carry_vacation_days).replace('.', ',') : '0');
    }).catch((e) => setMsg(errorText(e)));
  }, [emp.id, year]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try {
      await fn();
      setMsg(ok);
    } catch (e) {
      setMsg(errorText(e));
    }
  }

  async function saveYear() {
    const m = parseDuration(carry);
    const v = Number(carryVac.replace(',', '.'));
    if (m === null || !Number.isFinite(v)) {
      setMsg('Übertrag bitte als h:mm (z. B. −3:15) und Resturlaub als Zahl eingeben.');
      return;
    }
    await run(() => saveBalance({ employee_id: emp.id, year, carry_minutes: m, carry_vacation_days: v }),
      `Jahreswerte ${year} gespeichert.`);
  }

  return (
    <div className="stack">
      <h2>{emp.pseudonym}{!emp.active && <span className="badge">inaktiv</span>}</h2>

      <section className="card">
        <h3>Klarname</h3>
        <p className="hint">Nur für die Leitung sichtbar. Überall sonst erscheint {emp.pseudonym}.</p>
        <div className="grid2">
          <label>Vorname<input value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="off" /></label>
          <label>Nachname<input value={last} onChange={(e) => setLast(e.target.value)} autoComplete="off" /></label>
        </div>
        <div className="row">
          <button onClick={() => run(async () => { await saveIdentity(emp.id, first, last); onChanged(); }, 'Name gespeichert.')}>Name speichern</button>
          <label className="check">
            <input type="checkbox" checked={emp.active}
              onChange={(e) => run(async () => { await setEmployeeActive(emp.id, e.target.checked); onChanged(); }, 'Status gespeichert.')} />
            aktiv beschäftigt
          </label>
        </div>
        <AccountHelp emp={emp} />
      </section>

      <section className="card">
        <h3>Arbeitszeitmodell</h3>
        {terms.length === 0 && <p className="hint">Noch kein Modell hinterlegt.</p>}
        <ul className="versions">
          {terms.map((t) => (
            <li key={t.id}>
              <div><strong>ab {formatDe(t.valid_from)}</strong></div>
              <div className="hint">{termsSummary(t)}</div>
              <div className="row">
                <button className="link" onClick={() => setForm(t)}>bearbeiten</button>
                <button className="link" onClick={() => {
                  if (window.confirm(`Modellversion ab ${formatDe(t.valid_from)} löschen?`)) {
                    run(async () => { await deleteTerms(t.id!); await reloadTerms(); }, 'Version gelöscht. Dienstplan neu erzeugen.');
                  }
                }}>löschen</button>
              </div>
            </li>
          ))}
        </ul>
        {form ? (
          <TermsForm employeeId={emp.id} initial={form === 'new' ? null : form} params={params}
            onCancel={() => setForm(null)}
            onSaved={async () => { setForm(null); await reloadTerms(); setMsg('Modell gespeichert. Jetzt unten den Dienstplan neu erzeugen.'); }} />
        ) : (
          <button onClick={() => setForm('new')}>Neue Modellversion</button>
        )}
        <p className="hint">Ändert sich das Modell, eine neue Version mit neuem „Gültig ab“ anlegen statt die alte zu überschreiben. So bleiben vergangene Monate korrekt.</p>
      </section>

      <section className="card">
        <div className="row spread">
          <h3>Jahr</h3>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Jahr">
            {[year - 1, year, year + 1].map((y) => <option key={y}>{y}</option>)}
          </select>
        </div>
        <h4>Übertrag aus dem Vorjahr</h4>
        <div className="grid2">
          <label>Stunden-Saldo (h:mm)
            <input value={carry} onChange={(e) => setCarry(e.target.value)} placeholder="z. B. 12:30 oder −3:15" />
          </label>
          <label>Resturlaub (Tage)
            <input inputMode="decimal" value={carryVac} onChange={(e) => setCarryVac(e.target.value)} />
          </label>
        </div>
        <div className="row"><button onClick={saveYear}>Jahreswerte speichern</button></div>

        <h4>Dienstplan</h4>
        <ScheduleEditor employeeId={emp.id} year={year} />
      </section>

      {msg && <p className="note" role="status">{msg}</p>}
    </div>
  );
}
