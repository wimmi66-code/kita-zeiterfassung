# Kita-Zeiterfassung

Webbasierte Arbeitszeiterfassung für eine Elterninitiative mit wenigen Beschäftigten. Sie ersetzt die bisherigen Excel-Stundenzettel: Mitarbeitende erfassen ihre Zeiten selbst, die Leitung prüft und gibt bis zum 5. Werktag des Folgemonats frei, der Vorstand sieht die freigegebenen Monate und bestätigt den Eingang.

- Frontend: React + Vite, statisch auf GitHub Pages, installierbar als App auf dem Handy (PWA)
- Backend: Supabase (Region Frankfurt), Anmeldung per E-Mail-Link oder Code, PostgreSQL mit Row Level Security
- Oberfläche: Deutsch, für das Handy gebaut

Im Repository stehen **keine personenbezogenen Daten, keine Arbeitszeitmodelle und keine geheimen Schlüssel**. Namen, Modelle und Zeiten liegen ausschließlich in der Supabase-Datenbank.

## Inhalt

1. [Rollen und Ablauf](#rollen-und-ablauf)
2. [Supabase einrichten](#supabase-einrichten)
3. [Veröffentlichen auf GitHub Pages](#veröffentlichen-auf-github-pages)
4. [Benutzer und Rollen anlegen](#benutzer-und-rollen-anlegen)
5. [Stammdaten pflegen](#stammdaten-pflegen)
6. [Monatsabschluss](#monatsabschluss)
7. [Import und Export](#import-und-export)
8. [Jahreswechsel und Parameter](#jahreswechsel-und-parameter)
9. [Datenschutz und Aufbewahrung](#datenschutz-und-aufbewahrung)
10. [Lokale Entwicklung und Tests](#lokale-entwicklung-und-tests)
11. [Fehlerbehebung](#fehlerbehebung)

## Rollen und Ablauf

| Rolle | Sieht | Darf |
|---|---|---|
| mitarbeiter | nur eigene Daten | Zeiten erfassen, solange der Monat offen ist; Monat einreichen |
| leitung | alle Personen mit Klarnamen | prüfen, korrigieren (mit Begründung), zurückgeben, freigeben, Stammdaten pflegen |
| vorstand | nur freigegebene Monate, nur Pseudonyme | lesen, Eingang bestätigen, exportieren |
| vorstand mit `is_admin` | zusätzlich die Monate der Leitung | Monate der Leitung prüfen und freigeben (Vier-Augen-Prinzip) |

Status je Person und Monat: **offen → eingereicht → freigegeben**, bei Rückgabe **zurückgegeben → eingereicht**. Nach dem Einreichen sind die Einträge für die Person gesperrt. Freigegebene Monate ändert nur noch die prüfende Person, mit Pflichtbegründung. Jede Änderung an Zeiten, Dienstplan, Modellen und Status steht im Änderungsprotokoll (`audit_log`).

Die Leitung kann ihren eigenen Monat weder freigeben noch korrigieren. Das übernimmt der Admin-Vorstand.

Mitarbeitende erscheinen überall als Pseudonym (MA-01, MA-02 …). Die Klarnamen stehen in einer eigenen Tabelle, die nur die Leitung lesen kann.

## Supabase einrichten

### 1. Projekt anlegen

1. Auf [supabase.com](https://supabase.com) ein Projekt anlegen, **Region Frankfurt (eu-central-1)**. Das Projekt sollte einem Konto des Vereins gehören, nicht einer Privatperson.
2. Mit Supabase einen Auftragsverarbeitungsvertrag (DPA) für den Verein abschließen.

### 2. Datenbank einspielen

Im Supabase-Dashboard unter **SQL Editor** die Dateien aus `supabase/migrations` **in dieser Reihenfolge** einzeln einfügen und mit **Run** ausführen:

| Datei | Inhalt |
|---|---|
| `20270101000100_schema.sql` | Tabellen |
| `20270101000200_functions.sql` | Hilfsfunktionen, Schutz-Trigger, Protokoll, RPC-Funktionen |
| `20270101000300_rls.sql` | Rechte und Row Level Security |
| `20270101000400_parameters.sql` | Parameter ab 2027 (Minijob-Grenze, Mindestlohn, Fristen) |
| `20270101000500_parameter_2026.sql` | Parameter für 2026 |
| `20270101000600_submit_for.sql` | Monat im Auftrag einreichen |

Mit der Supabase-CLI geht es auch in einem Schritt: `supabase link` und danach `supabase db push`.

Prüfabfrage, ob alles da ist:

```sql
select
  (select count(*) from pg_tables where schemaname = 'public')              as tabellen,      -- 10
  (select bool_and(rowsecurity) from pg_tables where schemaname = 'public') as rls_ueberall,  -- true
  (select count(*) from pg_policies where schemaname = 'public')            as policies;      -- 20
```

### 3. Anmeldung einstellen

Unter **Authentication**:

1. **Sign In / Providers:** „Allow new users to sign up“ **aus**, „Allow anonymous sign-ins“ **aus**, Provider **Email** an. So kommen nur angelegte Konten hinein.
2. **URL Configuration:**
   - Site URL: `https://<github-name>.github.io/kita-zeiterfassung/`
   - Redirect URLs: `https://<github-name>.github.io/kita-zeiterfassung/**` und für die Entwicklung `http://localhost:5173/**`
3. **Emails → SMTP Settings:** eigenen Mailserver eintragen (Absenderadresse der Kita). Der eingebaute Versand von Supabase schickt nur sehr wenige Mails pro Stunde und erlaubt keine eigenen Vorlagen.
4. **Emails → Templates → Magic link or OTP:** Betreff und Text ersetzen. Wichtig ist `{{ .Token }}`, damit die Mail einen Code enthält:

```html
<h2>Anmeldung Kita-Zeiterfassung</h2>
<p>Zum Anmelden diesen Link antippen:</p>
<p><a href="{{ .ConfirmationURL }}">Jetzt anmelden</a></p>
<p>Oder diesen Code in der App eingeben:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>Link und Code gelten nur kurz und nur einmal. Wenn du keine Anmeldung angefordert hast, kannst du diese Mail ignorieren.</p>
```

Der Code ist der verlässlichere Weg. Manche Mailanbieter öffnen Links zur Virenprüfung vorab, dann ist der Link verbraucht. Und auf dem iPhone öffnet ein Link aus der Mail Safari statt der installierten App.

### 4. Schlüssel für das Frontend

Unter **Project Settings → API** (oder Button „Connect“) stehen die **Project URL** und der **anon / publishable key**. Nur diese beiden braucht das Frontend. Der `service_role`- bzw. `sb_secret_`-Schlüssel gehört nirgends ins Frontend und nicht ins Repository.

## Veröffentlichen auf GitHub Pages

1. Öffentliches Repository `kita-zeiterfassung` anlegen und den Code hochladen.
2. **Settings → Secrets and variables → Actions → New repository secret:**
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon bzw. publishable key
3. **Settings → Pages → Source:** „GitHub Actions“.
4. Jeder Push auf `main` startet `.github/workflows/deploy.yml`: Tests, Build, Veröffentlichung. Nach etwa zwei Minuten ist die App unter `https://<github-name>.github.io/kita-zeiterfassung/` erreichbar.

Heißt das Repository anders, passt sich der Pfad automatisch an (`VITE_BASE` im Workflow). Die URLs in Supabase müssen dann ebenfalls angepasst werden.

Nach einem Update zeigt die installierte App die neue Version manchmal erst nach zweimaligem Neuladen oder einem Neustart der App.

## Benutzer und Rollen anlegen

Konten legt die verantwortliche Person im Supabase-Dashboard an. Aus dem Frontend heraus geht das bewusst nicht, weil dafür der geheime Schlüssel nötig wäre.

### Schritt 1: Konto anlegen

**Authentication → Users → Add user → Create new user:**

- E-Mail-Adresse eintragen
- ein beliebiges langes Passwort vergeben (wird nie benutzt)
- **Auto Confirm User** anhaken

Das ist zuverlässiger als „Send invitation“, weil kein Einladungslink verfallen kann.

### Schritt 2: Pseudonym anlegen (bei Mitarbeitenden und Leitung)

In der App unter **Stammdaten → Person hinzufügen**. Die App vergibt das nächste freie Pseudonym. Dort auch den Klarnamen eintragen.

### Schritt 3: Rolle zuweisen

Im **SQL Editor**, Adresse und Pseudonym einsetzen. Die Vorlage liegt auch in `supabase/setup/rolle-zuweisen.sql`. Die ausgefüllten Befehle nicht ins Repository einchecken.

```sql
-- Mitarbeiter/in
insert into public.profiles (user_id, role, employee_id)
select u.id, 'mitarbeiter', e.id from auth.users u, public.employees e
where u.email = 'name@beispiel.de' and e.pseudonym = 'MA-03';

-- Leitung (mit eigenem Pseudonym, weil sie selbst Zeiten erfasst)
insert into public.profiles (user_id, role, employee_id)
select u.id, 'leitung', e.id from auth.users u, public.employees e
where u.email = 'leitung@beispiel.de' and e.pseudonym = 'MA-02';

-- Vorstand mit Admin-Recht (gibt die Monate der Leitung frei)
insert into public.profiles (user_id, role, is_admin)
select id, 'vorstand', true from auth.users where email = 'vorstand@beispiel.de';

-- Vorstand ohne Admin-Recht
insert into public.profiles (user_id, role)
select id, 'vorstand' from auth.users where email = 'kasse@beispiel.de';

-- Rolle oder Pseudonym nachträglich ändern
update public.profiles p set role = 'leitung', employee_id = e.id
from auth.users u, public.employees e
where p.user_id = u.id and u.email = 'name@beispiel.de' and e.pseudonym = 'MA-02';
```

Ein `insert` meldet „Success. No rows returned“, auch wenn es die Adresse nicht gibt. Deshalb danach prüfen:

```sql
select u.email, p.role, p.is_admin, e.pseudonym, u.email_confirmed_at is not null as bestaetigt
from auth.users u
left join public.profiles p on p.user_id = u.id
left join public.employees e on e.id = p.employee_id
order by e.pseudonym nulls last;
```

In der App unter **Stammdaten** gibt es bei jeder Person ohne Konto die „Konto anlegen – Anleitung“, die den passenden Befehl mit Adresse und Pseudonym erzeugt.

### Ausscheiden

In den Stammdaten das Häkchen **aktiv beschäftigt** entfernen und in Supabase unter Authentication → Users das Konto löschen. Zeiten und Pseudonym bleiben für die Aufbewahrung erhalten.

## Stammdaten pflegen

Unter **Stammdaten** je Person:

- **Klarname:** nur für die Leitung sichtbar.
- **Arbeitszeitmodell:** Versionen mit „Gültig ab“. Ändert sich ein Modell, eine neue Version anlegen, statt die alte zu überschreiben. So bleiben vergangene Monate richtig.
  - Vollzeit / Stellenteilung: Planstunden je Wochentag (h:mm). Bei der Stellenteilung kann der Montag 14-tägig gelten, „erstmals am“ muss ein Montag sein.
  - Minijob Vertretung: keine Sollstunden, Stundenlohn.
  - Minijob Alltagshilfe: feste Einsatzzeit von–bis, Stundenlohn.
  - Urlaubstage pro Jahr (auch bei Minijobs).
- **Jahr:** Übertrag aus dem Vorjahr (Stunden-Saldo, Resturlaub).
- **Dienstplan:** „Dienstplan … aus Modell erzeugen“ legt für jedes Datum die Planstunden an, Feiertage NRW stehen automatisch auf 0. Einzelne Tage, z. B. Tauschtage, lassen sich überschreiben. Überschriebene Tage und freigegebene Monate bleiben beim Neuerzeugen unverändert. **Nach jeder Modelländerung neu erzeugen.**

### Rechenregeln

- Pause nach § 4 ArbZG automatisch: mehr als 6 h → 30 min, mehr als 9 h → 45 min, so abgezogen, dass die Arbeitszeit nicht unter die Schwelle fällt (6:10 h Anwesenheit → 10 min Abzug). Eine Lücke von mindestens 15 min zwischen zwei Blöcken zählt als Pause. Eine höhere Pause lässt sich eintragen.
- Urlaub, Krank: Ist = Soll des Tages. Halber Urlaubstag: Soll halbiert, gearbeitete Zeit zählt. Überstundenausgleich: Ist 0. Feiertag: Soll 0.
- Minijob: Verdienst = Stunden × Stundenlohn je Tag. Warnung ab 90 % der Monatsgrenze, Jahresgrenze = Summe der Monatsgrenzen. Geplante Tage ohne Eintrag werden nach § 17 MiLoG markiert (Frist: 7. Tag nach dem Arbeitstag).

## Monatsabschluss

1. **Mitarbeitende** tragen ihre Tage ein und tippen ab dem letzten Tag des Monats auf **Monat einreichen**.
2. **Leitung** öffnet **Team**. Die Übersicht zeigt je Person Status, Saldo, fehlende Tage und die **Frist (5. Werktag des Folgemonats, Mo–Fr ohne Feiertage NRW)**. Überfällige Monate sind rot.
3. Person antippen, Tage prüfen, bei Bedarf korrigieren (mit Begründung), dann **Freigeben** oder **Zurückgeben** mit Hinweis.
4. Liegt ein Stundenzettel auf Papier oder als Excel-Datei vor, kann die Leitung den Monat **im Auftrag einreichen** und danach freigeben.
5. **Vorstand** sieht unter **Freigaben** die freigegebenen Monate mit Summen und bestätigt den Eingang.
6. Die Monate der Leitung prüft und gibt der **Admin-Vorstand** unter „Leitung prüfen“ frei.

Bei der Freigabe speichert die App den Monatsstand (Ist, Soll, Saldo, Urlaub, Verdienst) mit Zeitpunkt und freigebender Person. Korrekturen danach speichern den Stand dieses und aller späteren freigegebenen Monate neu.

## Import und Export

### Import (CSV)

**Stammdaten → Zeiten importieren (CSV).** Format: UTF-8, Semikolon, Kopfzeile

```
kuerzel;datum;tagesart;kommen1;gehen1;kommen2;gehen2;pause_min;bemerkung
```

- `kuerzel`: die ersten drei Buchstaben des Nachnamens laut Klarname (z. B. `MÜL`). Die App ordnet das Pseudonym zu, eine Auswahl ist auch von Hand möglich.
- `datum`: `2026-10-15` oder `15.10.2026`
- `tagesart`: `arbeit`, `urlaub`, `halber_urlaub`, `krank`, `feiertag`, `ueberstundenausgleich`
- `pause_min`: abzuziehende Pause in Minuten, leer = gesetzliche Mindestpause

Vorhandene Einträge an denselben Tagen werden überschrieben. Importdateien enthalten echte Arbeitszeiten und gehören nicht ins Repository.

### Export

- **Monatsnachweis als PDF und Excel** im Layout der bisherigen Monatsblätter, mit Freigabevermerk statt Unterschriftsfeld. Nicht freigegebene Monate sind als ENTWURF gekennzeichnet. Zu finden unter Meine Zeiten, Team → Person und Freigaben → Person.
- **Jahresexport als CSV** aller Tageswerte zur Archivierung. Leitung: unter Team, ganz unten, auf Wunsch mit Klarnamen. Vorstand: unter Freigaben, nur freigegebene Monate.

## Jahreswechsel und Parameter

Zum Jahresbeginn:

1. Prüfen, ob in der Tabelle `parameters` die Werte für das neue Jahr stehen (Minijob-Verdienstgrenze, Mindestlohn). Neue Werte als zusätzliche Zeile mit neuem `valid_from` eintragen, alte nicht überschreiben:

```sql
insert into public.parameters (key, valid_from, value, note) values
  ('minijob_verdienstgrenze_cent', '2028-01-01', 00000, 'Minijob-Verdienstgrenze je Monat'),
  ('mindestlohn_cent',             '2028-01-01', 0000,  'Gesetzlicher Mindestlohn je Stunde');
```

   Beträge in Cent. Die aktuellen Werte bei der Minijob-Zentrale nachsehen.
2. Je Person den Dienstplan für das neue Jahr erzeugen (Stammdaten → Person → Jahr wählen → Dienstplan erzeugen).
3. Übertrag aus dem Vorjahr eintragen: Stunden-Saldo (Saldo Dezember) und Resturlaub.

## Datenschutz und Aufbewahrung

- Im Repository liegen nur Code und SQL-Strukturen. Namen, Modelle, Löhne und Zeiten liegen in Supabase (Frankfurt).
- Jede Tabelle hat Row Level Security. Ohne Anmeldung ist jeder Zugriff gesperrt. Die Rechte sind in `supabase/tests/10_rls_test.sql` getestet.
- Klarnamen liest nur die Leitung. Der Vorstand arbeitet mit Pseudonymen, die Zuordnung erfolgt bei Bedarf über die Leitung. Klarnamen werden nicht protokolliert.
- Mit Supabase einen Auftragsverarbeitungsvertrag abschließen.
- Aufbewahrung mindestens zwei Jahre (§ 17 MiLoG): Die App löscht nichts automatisch. Zusätzlich jedes Jahr den Jahresexport als CSV herunterladen und beim Verein ablegen. Exporte mit Klarnamen vertraulich behandeln.

## Lokale Entwicklung und Tests

Voraussetzung: Node.js 22.

```bash
npm install
cp .env.example .env     # VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY eintragen
npm run dev              # http://localhost:5173/kita-zeiterfassung/
npm test                 # Unit-Tests (Feiertage NRW, Pausen, Soll, Frist, Minijob, Import, Export)
npm run build
```

`.env` steht in `.gitignore` und wird nie eingecheckt.

Datenbank- und RLS-Tests gegen ein lokales PostgreSQL 16 (ohne Supabase):

```bash
PGHOST=/pfad/zum/socket PGPORT=5432 ./supabase/tests/run_local.sh
```

Das Skript legt eine Testdatenbank an, bildet die Supabase-Rollen nach, spielt alle Migrationen ein, prüft die Rechte jeder Rolle und löscht die Datenbank wieder.

### Aufbau

```
src/lib/           Rechenlogik ohne Oberfläche (dates, holidays, deadline, breaks, schedule, calc, minijob, summary, importCsv, export/)
src/lib/__tests__/ Unit-Tests
src/pages/         Ansichten (Login, MeineZeiten, Team, Review, Freigaben, Stammdaten)
supabase/migrations/  SQL-Migrationen
supabase/tests/       RLS- und Ablauftests
supabase/setup/       Vorlagen für die Rollenvergabe (ohne echte Daten)
```

## Fehlerbehebung

| Meldung | Ursache und Lösung |
|---|---|
| „Diese Adresse ist nicht freigeschaltet“ | Kein bestätigtes Konto mit dieser Adresse. Konto mit „Auto Confirm User“ anlegen. |
| „Konto noch nicht freigeschaltet“ nach der Anmeldung | Konto ohne Rolle. Rolle per SQL zuweisen. |
| „Der Link aus der E-Mail ist abgelaufen …“ | Link verbraucht oder abgelaufen. Neuen Link anfordern und den Code eintippen. |
| „Zu viele Anmeldemails …“ | Mail-Limit erreicht. Warten oder eigenen SMTP-Server eintragen und Limit unter Authentication → Rate Limits erhöhen. |
| „Einrichtung fehlt“ | Secrets `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` fehlen oder sind falsch benannt. |
| „Invalid API key“ oder „Keine Verbindung“ | Wert eines Secrets falsch, z. B. mit Leerzeichen oder zweiter Zeile. Secret neu eintragen. |
| Soll stimmt nicht | Modell prüfen, dann den Dienstplan neu erzeugen. |
| „keine Verdienstgrenze für … hinterlegt“ | Parameter für das Jahr fehlen, siehe Jahreswechsel. |
| Neue Funktionen fehlen nach dem Update | Unter Actions prüfen, ob der Lauf grün ist; App zweimal neu laden. |
