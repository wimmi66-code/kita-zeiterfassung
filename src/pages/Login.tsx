import { useEffect, useState, type FormEvent } from 'react';
import { errorText, supabase } from '../lib/supabase';

// Anmeldung per E-Mail: Link anklicken ODER 6-stelligen Code eintippen.
// Der Code ist wichtig für die installierte App (PWA) auf dem iPhone,
// weil ein Link dort im Browser statt in der App öffnet.
export default function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Fehler aus einem abgelaufenen oder schon benutzten E-Mail-Link (steht in der Adresse)
  useEffect(() => {
    const p = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1));
    if (p.get('error') || p.get('error_code')) {
      setMsg('Der Link aus der E-Mail ist abgelaufen oder wurde schon benutzt. Bitte einen neuen Link anfordern und den Code aus der E-Mail hier eintippen.');
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  async function requestLink(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin + import.meta.env.BASE_URL,
      },
    });
    setBusy(false);
    if (error) {
      setMsg(errorText(error));
      return;
    }
    setSent(true);
  }

  async function verifyCode(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setMsg(errorText(error));
  }

  return (
    <main className="narrow">
      <h1>Kita-Zeiterfassung</h1>
      {!sent ? (
        <form onSubmit={requestLink} className="card">
          <label>
            E-Mail-Adresse
            <input type="email" required autoComplete="email" inputMode="email"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="primary" disabled={busy}>Anmeldelink anfordern</button>
          <p className="hint">Du bekommst eine E-Mail mit einem Link und einem Code. Ein Passwort gibt es nicht.</p>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="card">
          <p>E-Mail an <strong>{email}</strong> ist unterwegs. Link in der E-Mail antippen oder den Code hier eingeben:</p>
          <label>
            Code aus der E-Mail
            <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" required
              value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <button className="primary" disabled={busy}>Anmelden</button>
          <button type="button" className="link" onClick={() => { setSent(false); setCode(''); }}>
            Andere Adresse verwenden
          </button>
        </form>
      )}
      {msg && <p className="error" role="alert">{msg}</p>}
    </main>
  );
}
