import { useState } from 'react';
import type { EmployeeRow } from '../../lib/api';

// Konten anlegen geht nur im Supabase-Dashboard (braucht den geheimen Schlüssel).
// Diese Hilfe erzeugt den passenden SQL-Befehl im Browser; nichts davon wird gespeichert.
export default function AccountHelp({ emp }: { emp: EmployeeRow }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [copied, setCopied] = useState(false);

  const mail = email.trim().toLowerCase().replace(/'/g, "''");
  const sql = `insert into public.profiles (user_id, role, employee_id)
select u.id, 'mitarbeiter', e.id
from auth.users u, public.employees e
where u.email = '${mail}' and e.pseudonym = '${emp.pseudonym}';`;

  if (emp.has_account) {
    return <p className="hint">Konto verknüpft ({emp.role}).</p>;
  }

  return (
    <div>
      <p className="hint">Noch kein Benutzerkonto verknüpft.{' '}
        <button className="link" onClick={() => setOpen(!open)}>{open ? 'Anleitung schließen' : 'Konto anlegen – Anleitung'}</button>
      </p>
      {open && (
        <ol className="hint steps">
          <li>Supabase → Authentication → Users → „Add user“ → „Send invitation“ an die dienstliche Adresse.</li>
          <li>
            Adresse hier eintragen:
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setCopied(false); }} placeholder="name@beispiel.de" />
          </li>
          {mail && (
            <li>
              Diesen Befehl im Supabase SQL Editor ausführen:
              <pre className="sql">{sql}</pre>
              <button onClick={() => navigator.clipboard.writeText(sql).then(() => setCopied(true))}>
                {copied ? 'Kopiert' : 'Befehl kopieren'}
              </button>
            </li>
          )}
          <li>Danach meldet sich die Person in der App mit ihrer Adresse an.</li>
        </ol>
      )}
    </div>
  );
}
