-- =====================================================================
-- Migration 2: Hilfsfunktionen, Schutz-Trigger, Protokoll, RPC-Funktionen
-- =====================================================================

-- ---------- Wer bin ich? (Schema app, nicht über die API erreichbar) --
create or replace function app.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where user_id = auth.uid()
$$;

create or replace function app.my_employee() returns uuid
language sql stable security definer set search_path = '' as $$
  select employee_id from public.profiles where user_id = auth.uid()
$$;

create or replace function app.is_leitung() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.my_role() = 'leitung', false)
$$;

create or replace function app.is_vorstand() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.my_role() = 'vorstand', false)
$$;

create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'vorstand' and is_admin from public.profiles where user_id = auth.uid()), false)
$$;

-- Gehört das Pseudonym zu einem Konto mit Rolle leitung?
create or replace function app.is_leitung_employee(p_employee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where role = 'leitung' and employee_id = p_employee)
$$;

-- Darf der angemeldete Benutzer die Monate dieser Person prüfen, korrigieren und freigeben?
--  · Leitung: alle außer sich selbst
--  · Vorstand mit is_admin: nur die Monate der Leitung
create or replace function app.can_review(p_employee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (app.is_leitung() and p_employee is distinct from app.my_employee())
      or (app.is_admin() and app.is_leitung_employee(p_employee))
$$;

-- Admin-Vorstand sieht die Daten der Leitung auch vor der Freigabe.
create or replace function app.admin_sees(p_employee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_admin() and app.is_leitung_employee(p_employee)
$$;

-- Status eines Monats; ohne Zeile gilt "offen".
create or replace function app.month_status(p_employee uuid, p_day date) returns public.month_status
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select status from public.month_closings
      where employee_id = p_employee
        and year  = extract(year  from p_day)::int
        and month = extract(month from p_day)::int),
    'offen'::public.month_status)
$$;

create or replace function app.month_is_editable(p_employee uuid, p_day date) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.month_status(p_employee, p_day) in ('offen', 'zurueckgegeben')
$$;

-- Begründung, die eine RPC-Funktion für die laufende Transaktion setzt.
create or replace function app.change_reason() returns text
language sql stable set search_path = '' as $$
  select nullif(btrim(current_setting('app.change_reason', true)), '')
$$;

-- ---------- Änderungsprotokoll (für alle relevanten Tabellen) -------
create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_key jsonb;
begin
  -- Schlüssel ohne Inhalte (keine Klarnamen; employee_id ist eine UUID)
  v_key := jsonb_strip_nulls(jsonb_build_object(
    'employee_id', v_row->'employee_id', 'day', v_row->'day',
    'year', v_row->'year', 'month', v_row->'month',
    'valid_from', v_row->'valid_from', 'key', v_row->'key', 'user_id', v_row->'user_id'));

  insert into public.audit_log (actor, actor_role, table_name, action, row_key, old_row, new_row, reason)
  values (auth.uid(), app.my_role(), tg_table_name, tg_op, v_key,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
          app.change_reason());
  return null;
end $$;

create trigger audit_time_entries     after insert or update or delete on public.time_entries     for each row execute function app.audit();
create trigger audit_month_closings   after insert or update or delete on public.month_closings   for each row execute function app.audit();
create trigger audit_schedule_days    after insert or update or delete on public.schedule_days    for each row execute function app.audit();
create trigger audit_employment_terms after insert or update or delete on public.employment_terms for each row execute function app.audit();
create trigger audit_year_balances    after insert or update or delete on public.year_balances    for each row execute function app.audit();
create trigger audit_parameters       after insert or update or delete on public.parameters       for each row execute function app.audit();
create trigger audit_profiles         after insert or update or delete on public.profiles         for each row execute function app.audit();
-- employee_identities wird bewusst nicht protokolliert, damit keine Klarnamen im Protokoll landen.

-- ---------- Schutz der Zeiteinträge ---------------------------------
-- Zweite Verteidigungslinie hinter RLS. Gilt auch für RPC-Funktionen.
create or replace function app.guard_time_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r        public.time_entries;
  v_status public.month_status;
  v_reason text := app.change_reason();
begin
  r := case when tg_op = 'DELETE' then old else new end;

  if tg_op = 'UPDATE' and (new.employee_id <> old.employee_id or new.day <> old.day) then
    raise exception 'Person und Datum eines Eintrags können nicht geändert werden.';
  end if;

  -- Eine Begründung (= Korrektur) darf nur setzen, wer diese Person prüft.
  -- Damit kann niemand seine eigenen Einträge "korrigieren".
  if v_reason is not null and not app.can_review(r.employee_id) then
    raise exception 'Keine Berechtigung, Einträge dieser Person zu korrigieren.';
  end if;

  -- Fremde Einträge nur durch die prüfende Person, immer mit Begründung.
  if r.employee_id is distinct from app.my_employee() and v_reason is null then
    raise exception 'Fremde Einträge werden nur mit Begründung korrigiert.';
  end if;

  v_status := app.month_status(r.employee_id, r.day);
  if v_status in ('eingereicht', 'freigegeben') and v_reason is null then
    raise exception 'Der Monat ist %. Änderungen nur durch die prüfende Person mit Begründung.', v_status;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  -- Zeitstempel sind nicht fälschbar (Nachweis Erfassungsfrist § 17 MiLoG).
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create trigger guard_time_entries
  before insert or update or delete on public.time_entries
  for each row execute function app.guard_time_entry();

-- ---------- Schutz des Dienstplans ----------------------------------
create or replace function app.guard_schedule_day() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r public.schedule_days := case when tg_op = 'DELETE' then old else new end;
begin
  if tg_op = 'UPDATE' and (new.employee_id <> old.employee_id or new.day <> old.day) then
    raise exception 'Person und Datum eines Dienstplantags können nicht geändert werden.';
  end if;
  if app.month_status(r.employee_id, r.day) = 'freigegeben' and app.change_reason() is null then
    raise exception 'Dienstplan eines freigegebenen Monats: Änderung nur mit Begründung.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.updated_at := now();
  return new;
end $$;

create trigger guard_schedule_days
  before insert or update or delete on public.schedule_days
  for each row execute function app.guard_schedule_day();

-- ---------- Protokoll ist unveränderlich ----------------------------
create or replace function app.deny_change() returns trigger
language plpgsql as $$
begin
  raise exception 'Das Änderungsprotokoll kann nicht verändert werden.';
end $$;

create trigger audit_log_readonly
  before update or delete on public.audit_log
  for each row execute function app.deny_change();

-- =====================================================================
-- RPC-Funktionen (über supabase.rpc() aufrufbar)
-- =====================================================================

-- Welche Pseudonyme darf ich prüfen? (für die Übersicht von Leitung und Admin-Vorstand)
create or replace function public.reviewable_employees()
returns setof public.employees
language sql stable security definer set search_path = '' as $$
  select e.* from public.employees e where app.can_review(e.id) order by e.pseudonym
$$;

-- Hilfsfunktion: Begründung prüfen und für die Transaktion setzen
create or replace function app.require_reason(p_reason text) returns void
language plpgsql set search_path = '' as $$
begin
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'Bitte eine Begründung angeben (mindestens 5 Zeichen).';
  end if;
  perform set_config('app.change_reason', btrim(p_reason), true);
end $$;

-- Mitarbeitende reichen ihren Monat ein (frühestens am letzten Tag des Monats).
create or replace function public.submit_month(p_year int, p_month int)
returns public.month_closings
language plpgsql security definer set search_path = '' as $$
declare
  v_emp uuid := app.my_employee();
  v_last date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  v_row public.month_closings;
begin
  if v_emp is null then
    raise exception 'Kein Pseudonym mit diesem Konto verknüpft.';
  end if;
  if current_date < v_last then
    raise exception 'Der Monat kann erst ab dem % eingereicht werden.', to_char(v_last, 'DD.MM.YYYY');
  end if;
  if not app.month_is_editable(v_emp, v_last) then
    raise exception 'Der Monat ist bereits %.', app.month_status(v_emp, v_last);
  end if;

  insert into public.month_closings (employee_id, year, month, status, submitted_at, submitted_by)
  values (v_emp, p_year, p_month, 'eingereicht', now(), auth.uid())
  on conflict (employee_id, year, month) do update
    set status = 'eingereicht', submitted_at = now(), submitted_by = auth.uid()
  returning * into v_row;
  return v_row;
end $$;

-- Freigabe: Leitung für alle anderen, Admin-Vorstand für die Leitung.
create or replace function public.release_month(p_employee uuid, p_year int, p_month int, p_summary jsonb)
returns public.month_closings
language plpgsql security definer set search_path = '' as $$
declare v_row public.month_closings;
begin
  if p_employee = app.my_employee() then raise exception 'Eigene Monate können nicht selbst freigegeben werden.'; end if;
  if not app.can_review(p_employee) then raise exception 'Keine Berechtigung zur Freigabe dieses Monats.'; end if;

  update public.month_closings
     set status = 'freigegeben', released_at = now(), released_by = auth.uid(), summary = p_summary
   where employee_id = p_employee and year = p_year and month = p_month and status = 'eingereicht'
  returning * into v_row;

  if v_row is null then raise exception 'Nur eingereichte Monate können freigegeben werden.'; end if;
  return v_row;
end $$;

-- Rückgabe mit Begründung. Der Monat ist danach wieder bearbeitbar.
create or replace function public.return_month(p_employee uuid, p_year int, p_month int, p_reason text)
returns public.month_closings
language plpgsql security definer set search_path = '' as $$
declare v_row public.month_closings;
begin
  if not app.can_review(p_employee) then raise exception 'Keine Berechtigung zur Rückgabe dieses Monats.'; end if;
  perform app.require_reason(p_reason);

  update public.month_closings
     set status = 'zurueckgegeben', returned_at = now(), returned_by = auth.uid(), return_reason = btrim(p_reason)
   where employee_id = p_employee and year = p_year and month = p_month and status = 'eingereicht'
  returning * into v_row;

  if v_row is null then raise exception 'Nur eingereichte Monate können zurückgegeben werden.'; end if;
  return v_row;
end $$;

-- Vorstand bestätigt den Eingang eines freigegebenen Monats.
create or replace function public.acknowledge_month(p_employee uuid, p_year int, p_month int)
returns public.month_closings
language plpgsql security definer set search_path = '' as $$
declare v_row public.month_closings;
begin
  if not app.is_vorstand() then raise exception 'Nur der Vorstand kann den Eingang bestätigen.'; end if;

  update public.month_closings
     set acknowledged_at = now(), acknowledged_by = auth.uid()
   where employee_id = p_employee and year = p_year and month = p_month
     and status = 'freigegeben' and acknowledged_at is null
  returning * into v_row;

  if v_row is null then raise exception 'Monat ist nicht freigegeben oder bereits bestätigt.'; end if;
  return v_row;
end $$;

-- Korrektur eines Eintrags durch die prüfende Person (auch nach Freigabe), immer mit Begründung.
create or replace function public.correct_entry(
  p_employee uuid, p_day date, p_day_type public.day_type,
  p_start1 time, p_end1 time, p_start2 time, p_end2 time,
  p_break_minutes int, p_note text, p_reason text)
returns public.time_entries
language plpgsql security definer set search_path = '' as $$
declare v_row public.time_entries;
begin
  if p_employee = app.my_employee() then
    raise exception 'Eigene Einträge werden in der normalen Erfassung bearbeitet, nicht als Korrektur.';
  end if;
  if not app.can_review(p_employee) then raise exception 'Keine Berechtigung, diese Person zu korrigieren.'; end if;
  perform app.require_reason(p_reason);

  insert into public.time_entries (employee_id, day, day_type, start1, end1, start2, end2, break_minutes, note)
  values (p_employee, p_day, p_day_type, p_start1, p_end1, p_start2, p_end2, p_break_minutes, p_note)
  on conflict (employee_id, day) do update
    set day_type = excluded.day_type, start1 = excluded.start1, end1 = excluded.end1,
        start2 = excluded.start2, end2 = excluded.end2,
        break_minutes = excluded.break_minutes, note = excluded.note
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.correct_delete_entry(p_employee uuid, p_day date, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_employee = app.my_employee() then
    raise exception 'Eigene Einträge werden in der normalen Erfassung bearbeitet, nicht als Korrektur.';
  end if;
  if not app.can_review(p_employee) then raise exception 'Keine Berechtigung, diese Person zu korrigieren.'; end if;
  perform app.require_reason(p_reason);
  delete from public.time_entries where employee_id = p_employee and day = p_day;
end $$;

-- Dienstplantag in einem freigegebenen Monat ändern (nur mit Begründung).
create or replace function public.leitung_set_schedule_day(
  p_employee uuid, p_day date, p_plan_minutes int, p_note text, p_reason text)
returns public.schedule_days
language plpgsql security definer set search_path = '' as $$
declare v_row public.schedule_days;
begin
  if not app.is_leitung() then raise exception 'Nur die Leitung pflegt den Dienstplan.'; end if;
  perform app.require_reason(p_reason);
  insert into public.schedule_days (employee_id, day, plan_minutes, note, is_override)
  values (p_employee, p_day, p_plan_minutes, p_note, true)
  on conflict (employee_id, day) do update
    set plan_minutes = excluded.plan_minutes, note = excluded.note, is_override = true
  returning * into v_row;
  return v_row;
end $$;

-- Monatswerte nach einer Korrektur in einem freigegebenen Monat neu speichern.
-- Keine erneute Freigabe nötig: Begründung + Protokolleintrag genügen.
create or replace function public.update_summary(
  p_employee uuid, p_year int, p_month int, p_summary jsonb, p_reason text)
returns public.month_closings
language plpgsql security definer set search_path = '' as $$
declare v_row public.month_closings;
begin
  if not app.can_review(p_employee) then raise exception 'Keine Berechtigung, Monatswerte dieser Person zu ändern.'; end if;
  perform app.require_reason(p_reason);
  update public.month_closings set summary = p_summary
   where employee_id = p_employee and year = p_year and month = p_month and status = 'freigegeben'
  returning * into v_row;
  if v_row is null then raise exception 'Monat ist nicht freigegeben.'; end if;
  return v_row;
end $$;
