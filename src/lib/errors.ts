// Fehlermeldungen von Supabase/PostgreSQL ins Deutsche übersetzen.
const MAP: [RegExp, string][] = [
  [/email rate limit exceeded|over_email_send_rate_limit|For security purposes, you can only request/i,
    'Zu viele Anmeldemails in kurzer Zeit. Bitte etwas später erneut versuchen.'],
  [/Signups not allowed|User not found|otp_disabled/i,
    'Diese Adresse ist nicht freigeschaltet. Bitte an die Leitung wenden.'],
  [/Token has expired or is invalid|otp_expired/i, 'Der Code stimmt nicht oder ist abgelaufen.'],
  [/Failed to fetch|NetworkError|Load failed/i, 'Keine Verbindung zum Server. Bitte Internetverbindung prüfen.'],
  [/Invalid API key|No API key/i, 'Die App ist falsch konfiguriert (API-Schlüssel). Bitte an die Leitung wenden.'],
  [/JWT expired/i, 'Die Anmeldung ist abgelaufen. Bitte neu anmelden.'],
  [/permission denied|row-level security/i, 'Dafür fehlt die Berechtigung.'],
  [/duplicate key value.*pseudonym/i, 'Dieses Pseudonym gibt es bereits.'],
  [/duplicate key value.*employment_terms/i, 'Für dieses Datum gibt es schon eine Modellversion.'],
  [/duplicate key value/i, 'Dieser Eintrag existiert bereits.'],
  [/violates check constraint/i, 'Die Eingabe ist unvollständig oder ungültig.'],
];

export function errorText(e: unknown): string {
  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : String(e);
  for (const [re, de] of MAP) if (re.test(msg)) return de;
  return msg; // eigene Meldungen der Datenbank sind bereits deutsch
}
