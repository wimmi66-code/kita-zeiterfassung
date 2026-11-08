-- =====================================================================
-- Migration 5: Werte für 2026 (für Tests und Übertrag aus 2026)
-- Minijob-Grenze 2026: 603 €, Mindestlohn 2026: 13,90 €
-- =====================================================================
insert into public.parameters (key, valid_from, value, note) values
  ('minijob_verdienstgrenze_cent', '2026-01-01', 60300, 'Minijob-Verdienstgrenze je Monat'),
  ('minijob_warnschwelle',         '2026-01-01', 0.9,   'Warnung ab diesem Anteil der Verdienstgrenze'),
  ('mindestlohn_cent',             '2026-01-01', 1390,  'Gesetzlicher Mindestlohn je Stunde'),
  ('freigabe_frist_werktag',       '2026-01-01', 5,     'Freigabe bis zum n-ten Werktag des Folgemonats'),
  ('milog_erfassungsfrist_tage',   '2026-01-01', 7,     'Aufzeichnung bis zum n-ten Tag nach dem Arbeitstag (§ 17 MiLoG)')
on conflict do nothing;
