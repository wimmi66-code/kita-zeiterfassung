import { useEffect, useState } from 'react';
import { createEmployee, loadEmployees, loadParameters, nextPseudonym, type EmployeeRow } from '../lib/api';
import { errorText } from '../lib/errors';
import type { Parameter } from '../lib/types';
import PersonDetail from './stammdaten/PersonDetail';

export default function Stammdaten() {
  const [list, setList] = useState<EmployeeRow[]>([]);
  const [params, setParams] = useState<Parameter[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function reload() {
    const [e, p] = await Promise.all([loadEmployees(), loadParameters()]);
    setList(e);
    setParams(p);
  }

  useEffect(() => {
    reload().catch((e) => setMsg(errorText(e)));
  }, []);

  async function add() {
    const p = nextPseudonym(list.map((e) => e.pseudonym));
    if (!window.confirm(`Neue Person mit Pseudonym ${p} anlegen?`)) return;
    try {
      const e = await createEmployee(p);
      await reload();
      setSelected(e.id);
    } catch (e) {
      setMsg(errorText(e));
    }
  }

  const emp = list.find((e) => e.id === selected);

  if (emp) {
    return (
      <div className="stack">
        <button className="link" onClick={() => setSelected(null)}>← Alle Personen</button>
        <PersonDetail emp={emp} params={params} onChanged={() => reload().catch((e) => setMsg(errorText(e)))} />
      </div>
    );
  }

  return (
    <div className="stack">
      <h2>Stammdaten</h2>
      <ul className="people">
        {list.map((e) => (
          <li key={e.id}>
            <button onClick={() => setSelected(e.id)}>
              <strong>{e.pseudonym}</strong>
              <span>{[e.first_name, e.last_name].filter(Boolean).join(' ') || <em className="hint">ohne Namen</em>}</span>
              <span className="hint">
                {e.has_account ? `Konto: ${e.role}` : 'kein Konto'}{!e.active && ' · inaktiv'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button className="primary" onClick={add}>Person hinzufügen</button>
      {msg && <p className="error">{msg}</p>}
    </div>
  );
}
