-- RLS- und Ablauftests. Lokal ausführen mit:  ./supabase/tests/run_local.sh
-- Jede Prüfung meldet "OK: …" oder bricht mit "FEHLER: …" ab.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

create schema t;
grant usage on schema t to authenticated, anon;

create function t.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FEHLER: %', label; end if;
  raise notice 'OK: %', label;
end $$;

create function t.fails(stmt text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'OK: % (abgelehnt: %)', label, sqlerrm;
    return;
  end;
  raise exception 'FEHLER: % wurde NICHT abgelehnt', label;
end $$;

create function t.login(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u)::text, false);
end $$;
-- Bestanden, wenn die Anweisung abgelehnt wird ODER keine Zeile verändert.
create function t.no_effect(stmt text, label text) returns void language plpgsql as $$
declare n bigint;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
  exception when others then
    raise notice 'OK: % (abgelehnt: %)', label, sqlerrm;
    return;
  end;
  if n <> 0 then raise exception 'FEHLER: % hat % Zeile(n) verändert', label, n; end if;
  raise notice 'OK: % (0 Zeilen)', label;
end $$;
grant execute on all functions in schema t to authenticated, anon;

-- ---------- Testdaten (als Superuser, entspricht dem SQL-Editor) ----
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'leitung@test'),
  ('00000000-0000-0000-0000-00000000000b', 'ma2@test'),
  ('00000000-0000-0000-0000-00000000000c', 'ma3@test'),
  ('00000000-0000-0000-0000-00000000000d', 'vorstand@test'),
  ('00000000-0000-0000-0000-00000000000e', 'admin@test');
insert into public.employees (id, pseudonym) values
  ('10000000-0000-0000-0000-000000000001', 'MA-01'),
  ('10000000-0000-0000-0000-000000000002', 'MA-02'),
  ('10000000-0000-0000-0000-000000000003', 'MA-03');
insert into public.employee_identities values
  ('10000000-0000-0000-0000-000000000002', 'Test', 'Person', null);
insert into public.profiles (user_id, role, employee_id) values
  ('00000000-0000-0000-0000-00000000000a', 'leitung',     '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-00000000000b', 'mitarbeiter', '10000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-00000000000c', 'mitarbeiter', '10000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-00000000000d', 'vorstand',    null);
insert into public.profiles (user_id, role, employee_id, is_admin) values
  ('00000000-0000-0000-0000-00000000000e', 'vorstand',    null, true);
-- Admin nur für Vorstand
select t.fails($$insert into public.profiles (user_id, role, employee_id, is_admin)
                 values ('00000000-0000-0000-0000-00000000000c', 'mitarbeiter', '10000000-0000-0000-0000-000000000003', true)$$,
               'is_admin nur für Rolle vorstand');

-- ===================== anon ==========================================
set role anon;
select t.fails($$select * from public.employees$$, 'anon liest keine Pseudonyme');
select t.fails($$select * from public.time_entries$$, 'anon liest keine Zeiteinträge');
select t.fails($$select public.submit_month(2026, 10)$$, 'anon ruft keine RPC auf');
reset role;

-- ===================== Mitarbeiterin MA-02 ===========================
set role authenticated;
select t.login('00000000-0000-0000-0000-00000000000b');
insert into public.time_entries (employee_id, day, start1, end1, note, created_at)
  values ('10000000-0000-0000-0000-000000000002', '2026-10-05', '07:30', '15:30', 'Frühdienst', '2020-01-01');
select t.ok((select created_at > '2026-01-01' from public.time_entries where day = '2026-10-05'),
            'created_at lässt sich nicht rückdatieren');
select t.fails($$insert into public.time_entries (employee_id, day, start1, end1)
                 values ('10000000-0000-0000-0000-000000000003', '2026-10-05', '08:00', '12:00')$$,
               'MA-02 kann nicht für MA-03 erfassen');
select t.fails($$select set_config('app.change_reason', 'hack hack', true);
                 insert into public.time_entries (employee_id, day, start1, end1)
                 values ('10000000-0000-0000-0000-000000000003', '2026-10-06', '08:00', '12:00')$$,
               'MA-02 kann keine Begründung vortäuschen');
select t.ok((select count(*) = 1 from public.employees), 'MA-02 sieht nur das eigene Pseudonym');
select t.ok((select count(*) = 0 from public.employee_identities), 'MA-02 sieht keine Klarnamen');
select t.ok((select count(*) = 0 from public.audit_log), 'MA-02 sieht kein Protokoll');
select t.fails($$update public.profiles set role = 'leitung'$$, 'MA-02 kann sich keine Rolle geben');
select t.fails($$insert into public.month_closings (employee_id, year, month, status)
                 values ('10000000-0000-0000-0000-000000000002', 2026, 10, 'freigegeben')$$,
               'MA-02 kann den Status nicht direkt setzen');
select t.fails($$select public.release_month('10000000-0000-0000-0000-000000000002', 2026, 10, '{}')$$,
               'MA-02 kann nicht freigeben');
select t.fails($$select public.submit_month(2099, 12)$$, 'Einreichen vor Monatsende abgelehnt');
select public.submit_month(2026, 10);
select t.ok((select status = 'eingereicht' from public.month_closings where year = 2026 and month = 10),
            'MA-02 hat Oktober 2026 eingereicht');
select t.no_effect($$update public.time_entries set note = 'nachträglich' where day = '2026-10-05'$$,
            'Nach Einreichen ist der Eintrag für MA-02 gesperrt');
select t.fails($$insert into public.time_entries (employee_id, day, start1, end1)
                 values ('10000000-0000-0000-0000-000000000002', '2026-10-06', '08:00', '12:00')$$,
               'Nach Einreichen kein neuer Eintrag');
reset role;

-- ===================== Vorstand vor Freigabe =========================
set role authenticated;
select t.login('00000000-0000-0000-0000-00000000000d');
select t.ok((select count(*) = 0 from public.time_entries), 'Vorstand sieht eingereichte Monate nicht');
select t.ok((select count(*) = 3 from public.employees), 'Vorstand sieht alle Pseudonyme');
select t.ok((select count(*) = 0 from public.employee_identities), 'Vorstand sieht keine Klarnamen');
reset role;

-- ===================== Leitung =======================================
set role authenticated;
select t.login('00000000-0000-0000-0000-00000000000a');
select t.ok((select count(*) = 1 from public.employee_identities), 'Leitung sieht Klarnamen');
select t.no_effect($$update public.time_entries set note = 'x' where employee_id = '10000000-0000-0000-0000-000000000002'$$,
               'Leitung ändert fremde Einträge nicht direkt');
select t.fails($$select public.correct_entry('10000000-0000-0000-0000-000000000002', '2026-10-05',
                 'arbeit', '07:30', '15:00', null, null, null, 'korr', '')$$,
               'Korrektur ohne Begründung abgelehnt');
select public.correct_entry('10000000-0000-0000-0000-000000000002', '2026-10-05',
       'arbeit', '07:30', '15:00', null, null, null, 'Frühdienst', 'Gehen laut Dienstbuch 15:00');
select t.ok((select reason = 'Gehen laut Dienstbuch 15:00' from public.audit_log
              where table_name = 'time_entries' and action = 'UPDATE' order by id desc limit 1),
            'Korrektur mit Begründung im Protokoll');
select public.release_month('10000000-0000-0000-0000-000000000002', 2026, 10, '{"ist_min": 450}');
select t.ok((select released_by = '00000000-0000-0000-0000-00000000000a' and released_at is not null
               from public.month_closings where employee_id = '10000000-0000-0000-0000-000000000002'),
            'Freigabe speichert Zeitpunkt und Person');
-- Eigene Zeiten der Leitung
insert into public.time_entries (employee_id, day, start1, end1)
  values ('10000000-0000-0000-0000-000000000001', '2026-10-05', '08:00', '16:00');
reset role;
-- eigenen Monat einreichen (Superuser simuliert Leitung-Login nicht nötig)
set role authenticated;
select t.login('00000000-0000-0000-0000-00000000000a');
select public.submit_month(2026, 10);
select t.fails($$select public.release_month('10000000-0000-0000-0000-000000000001', 2026, 10, '{}')$$,
               'Leitung kann eigenen Monat nicht freigeben');
select t.fails($$select public.correct_entry('10000000-0000-0000-0000-000000000001', '2026-10-05',
                 'arbeit', '08:00', '17:00', null, null, null, null, 'eigene Korrektur')$$,
               'Leitung korrigiert eigenen eingereichten Monat nicht');
select t.no_effect($$delete from public.audit_log$$, 'Protokoll nicht löschbar');
reset role;

-- ===================== Admin-Vorstand prüft die Leitung ===============
set role authenticated;
select t.login('00000000-0000-0000-0000-00000000000e');
select t.ok((select array_agg(pseudonym) = '{MA-01}' from public.reviewable_employees()),
            'Admin-Vorstand prüft nur die Leitung (MA-01)');
select t.ok((select count(*) = 1 from public.time_entries where employee_id = '10000000-0000-0000-0000-000000000001'),
            'Admin-Vorstand sieht eingereichte Einträge der Leitung');
select t.ok((select count(*) = 0 from public.employee_identities), 'Admin-Vorstand sieht keine Klarnamen');
select t.fails($$select public.release_month('10000000-0000-0000-0000-000000000003', 2026, 10, '{}')$$,
               'Admin-Vorstand gibt keine anderen Mitarbeitenden frei');
select public.correct_entry('10000000-0000-0000-0000-000000000001', '2026-10-05',
       'arbeit', '08:00', '16:30', null, null, null, null, 'Teamsitzung bis 16:30');
select public.release_month('10000000-0000-0000-0000-000000000001', 2026, 10, '{"ist_min": 480}');
select t.ok((select released_by = '00000000-0000-0000-0000-00000000000e' from public.month_closings
               where employee_id = '10000000-0000-0000-0000-000000000001'),
            'Admin-Vorstand hat den Monat der Leitung freigegeben');
reset role;
set role authenticated;
select t.login('00000000-0000-0000-0000-00000000000d');
select t.ok((select count(*) = 0 from public.reviewable_employees()), 'Normaler Vorstand prüft niemanden');
reset role;
-- Nachkorrektur in freigegebenem Monat: Leitung korrigiert MA-02 und speichert neu
set role authenticated;
select t.login('00000000-0000-0000-0000-00000000000a');
select t.ok((select count(*) = 2 from public.reviewable_employees()), 'Leitung prüft alle außer sich selbst');
select public.correct_entry('10000000-0000-0000-0000-000000000002', '2026-10-05',
       'arbeit', '07:30', '15:15', null, null, null, 'Frühdienst', 'Nachtrag Elterngespräch');
select public.update_summary('10000000-0000-0000-0000-000000000002', 2026, 10, '{"ist_min": 465}', 'Nachtrag Elterngespräch');
select t.ok((select status = 'freigegeben' and (summary->>'ist_min')::int = 465 from public.month_closings
               where employee_id = '10000000-0000-0000-0000-000000000002'),
            'Nachkorrektur: bleibt freigegeben, Summen neu gespeichert');
reset role;

-- ===================== Vorstand nach Freigabe ========================
set role authenticated;
select t.login('00000000-0000-0000-0000-00000000000d');
select t.ok((select count(*) = 2 from public.time_entries), 'Vorstand sieht nur freigegebene Monate');
select t.ok((select count(*) = 2 from public.month_closings), 'Vorstand sieht nur freigegebene Abschlüsse');
select t.no_effect($$update public.time_entries set note = 'x'$$, 'Vorstand ändert nichts');
select public.acknowledge_month('10000000-0000-0000-0000-000000000002', 2026, 10);
select t.fails($$select public.acknowledge_month('10000000-0000-0000-0000-000000000002', 2026, 10)$$,
               'Eingang nur einmal bestätigbar');
reset role;

-- ===================== MA-02 nach Freigabe ===========================
set role authenticated;
select t.login('00000000-0000-0000-0000-00000000000b');
select t.no_effect($$delete from public.time_entries where day = '2026-10-05'$$,
               'Freigegebener Monat nicht löschbar');
select t.ok((select count(*) = 1 from public.time_entries), 'MA-02 sieht weiter den eigenen Eintrag');
reset role;

-- ===================== Rückgabe ======================================
set role authenticated;
select t.login('00000000-0000-0000-0000-00000000000c');
insert into public.time_entries (employee_id, day, start1, end1)
  values ('10000000-0000-0000-0000-000000000003', '2026-10-07', '11:30', '14:00');
select public.submit_month(2026, 10);
select t.login('00000000-0000-0000-0000-00000000000a');
select public.return_month('10000000-0000-0000-0000-000000000003', 2026, 10, 'Bitte 08.10. ergänzen');
select t.login('00000000-0000-0000-0000-00000000000c');
insert into public.time_entries (employee_id, day, start1, end1)
  values ('10000000-0000-0000-0000-000000000003', '2026-10-08', '11:30', '14:00');
select t.ok((select count(*) = 2 from public.time_entries), 'Nach Rückgabe wieder bearbeitbar');
reset role;

-- ===================== Im Auftrag einreichen ===========================
set role authenticated;
select t.login('00000000-0000-0000-0000-00000000000b');
select t.fails($$select public.submit_month_for('10000000-0000-0000-0000-000000000003', 2026, 9, 'Papierzettel liegt vor')$$,
               'Mitarbeitende reichen nicht für andere ein');
select t.login('00000000-0000-0000-0000-00000000000a');
select t.fails($$select public.submit_month_for('10000000-0000-0000-0000-000000000003', 2026, 9, '')$$,
               'Im Auftrag einreichen nur mit Begründung');
select t.fails($$select public.submit_month_for('10000000-0000-0000-0000-000000000001', 2026, 9, 'eigener Monat')$$,
               'Leitung reicht eigenen Monat nicht im Auftrag ein');
select public.submit_month_for('10000000-0000-0000-0000-000000000003', 2026, 9, 'Papierzettel liegt unterschrieben vor');
select t.ok((select status = 'eingereicht' and submitted_by = '00000000-0000-0000-0000-00000000000a'
               from public.month_closings where employee_id = '10000000-0000-0000-0000-000000000003' and month = 9),
            'Leitung hat September für MA-03 im Auftrag eingereicht');
select t.ok((select reason = 'Papierzettel liegt unterschrieben vor' from public.audit_log
              where table_name = 'month_closings' order by id desc limit 1),
            'Begründung im Protokoll');
select public.release_month('10000000-0000-0000-0000-000000000003', 2026, 9, '{}');
reset role;

select t.ok((select count(*) >= 8 from public.audit_log), 'Protokoll enthält alle Änderungen');
\echo 'Alle Tests bestanden.'
