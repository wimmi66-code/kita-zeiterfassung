import { useState } from 'react';
import { useAuth } from './auth';
import { configMissing } from './lib/supabase';
import Login from './pages/Login';
import Placeholder from './pages/Placeholder';

type View = 'meine' | 'team' | 'stammdaten' | 'freigegeben';

export default function App() {
  const { loading, session, profile, employee, error, signOut } = useAuth();
  const [view, setView] = useState<View | null>(null);

  if (configMissing) {
    return (
      <main className="narrow">
        <h1>Einrichtung fehlt</h1>
        <p>VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY sind nicht gesetzt. Siehe README.</p>
      </main>
    );
  }
  if (!session) return <Login />;
  if (loading) return <main className="narrow"><p>Lade …</p></main>;

  if (!profile) {
    return (
      <main className="narrow">
        <h1>Konto noch nicht freigeschaltet</h1>
        <p>Die Anmeldung hat geklappt, aber diesem Konto ist noch keine Rolle zugeordnet.
          Bitte der Leitung diese Kennung nennen:</p>
        <p><code className="select">{session.user.id}</code></p>
        {error && <p className="error">{error}</p>}
        <button onClick={signOut}>Abmelden</button>
      </main>
    );
  }

  // Menü je Rolle
  const tabs: { id: View; label: string }[] = [];
  if (profile.employee_id) tabs.push({ id: 'meine', label: 'Meine Zeiten' });
  if (profile.role === 'leitung') {
    tabs.push({ id: 'team', label: 'Team' }, { id: 'stammdaten', label: 'Stammdaten' });
  }
  if (profile.role === 'vorstand') {
    if (profile.is_admin) tabs.push({ id: 'team', label: 'Leitung prüfen' });
    tabs.push({ id: 'freigegeben', label: 'Freigaben' });
  }
  const current = view && tabs.some((t) => t.id === view) ? view : tabs[0]?.id;

  const roleLabel = profile.role === 'vorstand'
    ? (profile.is_admin ? 'Vorstand (Admin)' : 'Vorstand')
    : profile.role === 'leitung' ? 'Leitung' : 'Mitarbeiter/in';

  return (
    <>
      <header className="top">
        <div>
          <strong>{employee?.pseudonym ?? roleLabel}</strong>
          {employee && <span className="muted"> · {roleLabel}</span>}
        </div>
        <button className="link" onClick={signOut}>Abmelden</button>
      </header>
      {tabs.length > 1 && (
        <nav className="tabs">
          {tabs.map((t) => (
            <button key={t.id} className={t.id === current ? 'active' : ''} onClick={() => setView(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      )}
      <main>
        {current === 'meine' && <Placeholder title="Meine Zeiten" step="Schritt 4: Monatskalender und Tageserfassung" />}
        {current === 'team' && <Placeholder title={profile.role === 'leitung' ? 'Team' : 'Leitung prüfen'} step="Schritt 5: Übersicht, Prüfung und Freigabe" />}
        {current === 'stammdaten' && <Placeholder title="Stammdaten" step="Schritt 3: Pseudonyme, Arbeitszeitmodelle, Dienstplan" />}
        {current === 'freigegeben' && <Placeholder title="Freigegebene Monate" step="Schritt 6: Liste, Summen, Eingangsbestätigung" />}
      </main>
    </>
  );
}
