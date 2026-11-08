-- =====================================================================
-- Migration 4: Allgemeine Parameter (keine personenbezogenen Daten)
-- Neue Werte als zusätzliche Zeile mit späterem valid_from eintragen,
-- alte Werte nicht überschreiben.
-- =====================================================================
insert into public.parameters (key, valid_from, value, note) values
  ('minijob_verdienstgrenze_cent', '2027-01-01', 63300, 'Minijob-Verdienstgrenze je Monat'),
  ('minijob_warnschwelle',         '2027-01-01', 0.9,   'Warnung ab diesem Anteil der Verdienstgrenze'),
  ('mindestlohn_cent',             '2027-01-01', 1460,  'Gesetzlicher Mindestlohn je Stunde (Prüfung Stundenlohn)'),
  ('freigabe_frist_werktag',       '2027-01-01', 5,     'Freigabe bis zum n-ten Werktag des Folgemonats'),
  ('milog_erfassungsfrist_tage',   '2027-01-01', 7,     'Aufzeichnung bis zum n-ten Tag nach dem Arbeitstag (§ 17 MiLoG)')
on conflict do nothing;
