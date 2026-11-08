-- =====================================================================
-- Kita-Zeiterfassung · Migration 1: Grundschema
-- Enthält keine personenbezogenen Daten und keine Arbeitszeitmodelle.
-- Diese werden nach dem Deployment von der Leitung in der App erfasst.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Aufzählungstypen ----------------------------------------
create type public.app_role     as enum ('mitarbeiter', 'leitung', 'vorstand');
create type public.model_kind   as enum ('vollzeit', 'stellenteilung', 'minijob_vertretung', 'minijob_alltagshilfe');
create type public.day_type     as enum ('arbeit', 'urlaub', 'halber_urlaub', 'krank', 'feiertag', 'ueberstundenausgleich');
create type public.month_status as enum ('offen', 'eingereicht', 'freigegeben', 'zurueckgegeben');

-- Interne Hilfsfunktionen liegen im Schema "app", das die REST-API nicht veröffentlicht.
create schema if not exists app;

-- ---------- Mitarbeitende (nur Pseudonym) ---------------------------
create table public.employees (
  id          uuid primary key default gen_random_uuid(),
  pseudonym   text not null unique check (pseudonym ~ '^MA-[0-9]{2}$'),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
comment on table public.employees is 'Mitarbeitende nur als Pseudonym (MA-01 …). Klarnamen stehen in employee_identities.';

-- ---------- Klarnamen (nur Leitung) ---------------------------------
create table public.employee_identities (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  first_name  text not null,
  last_name   text not null,
  note        text
);
comment on table public.employee_identities is 'Zuordnung Pseudonym → Klarname. Lesbar ausschließlich für die Rolle leitung.';

-- ---------- Benutzerkonten → Rolle ----------------------------------
-- Ein Supabase-Benutzer hat genau eine Rolle. Mitarbeitende sind mit einem
-- Pseudonym verknüpft; die Leitung ist ebenfalls verknüpft, weil sie eigene
-- Zeiten erfasst. Ein Vorstandsmitglied mit is_admin prüft und gibt die
-- Monate der Leitung frei. Rollen werden nur im SQL-Editor vergeben.
create table public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        public.app_role not null,
  employee_id uuid unique references public.employees(id),
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint admin_nur_vorstand           check (not is_admin or role = 'vorstand'),
  constraint mitarbeiter_braucht_pseudonym check (role <> 'mitarbeiter' or employee_id is not null),
  constraint vorstand_ohne_pseudonym      check (role <> 'vorstand'    or employee_id is null)
);

-- ---------- Arbeitszeitmodelle (versioniert je Person) --------------
create table public.employment_terms (
  id                     uuid primary key default gen_random_uuid(),
  employee_id            uuid not null references public.employees(id),
  valid_from             date not null,
  kind                   public.model_kind not null,
  weekly_minutes         integer check (weekly_minutes between 0 and 3600),
  -- Planminuten je Wochentag, Index 1 = Montag … 7 = Sonntag
  plan_minutes           integer[] not null default '{0,0,0,0,0,0,0}'
                         check (array_length(plan_minutes, 1) = 7),
  -- Stellenteilung: Montag nur 14-tägig, beginnend an diesem Montag
  monday_biweekly_from   date check (monday_biweekly_from is null or extract(isodow from monday_biweekly_from) = 1),
  -- Alltagshilfe: fester Einsatz
  fixed_start            time,
  fixed_end              time,
  vacation_days_per_year numeric(4,1) check (vacation_days_per_year >= 0),
  hourly_wage_cents      integer check (hourly_wage_cents > 0),
  created_at             timestamptz not null default now(),
  created_by             uuid default auth.uid(),
  unique (employee_id, valid_from),
  check ((fixed_start is null) = (fixed_end is null)),
  check (fixed_end is null or fixed_end > fixed_start),
  check (kind not in ('minijob_vertretung', 'minijob_alltagshilfe') or hourly_wage_cents is not null)
);
comment on table public.employment_terms is 'Arbeitszeitmodell je Person, gültig ab valid_from bis zur nächsten Version.';

-- ---------- Jahresstartwerte ----------------------------------------
create table public.year_balances (
  employee_id          uuid not null references public.employees(id),
  year                 integer not null check (year between 2020 and 2100),
  carry_minutes        integer not null default 0,         -- Übertrag Vorjahr (Stunden-Saldo)
  carry_vacation_days  numeric(4,1) not null default 0,    -- Resturlaub Vorjahr
  primary key (employee_id, year)
);

-- ---------- Dienstplan (Planminuten je Tag) -------------------------
-- Wird in der App aus dem Arbeitszeitmodell erzeugt. Von der Leitung
-- überschriebene Tage (is_override) bleiben bei einer Neuerzeugung erhalten.
create table public.schedule_days (
  employee_id  uuid not null references public.employees(id),
  day          date not null,
  plan_minutes integer not null default 0 check (plan_minutes between 0 and 720),
  fixed_start  time,
  fixed_end    time,
  is_holiday   boolean not null default false,
  is_override  boolean not null default false,
  note         text check (char_length(note) <= 200),
  updated_at   timestamptz not null default now(),
  primary key (employee_id, day)
);

-- ---------- Zeiteinträge --------------------------------------------
create table public.time_entries (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id),
  day           date not null,
  day_type      public.day_type not null default 'arbeit',
  start1        time,
  end1          time,
  start2        time,
  end2          time,
  -- Manuell eingetragene Gesamtpause in Minuten. Angerechnet wird
  -- max(gesetzliche Mindestpause, manuelle Pause); die App rechnet.
  break_minutes integer check (break_minutes between 0 and 600),
  note          text check (char_length(note) <= 500),
  created_at    timestamptz not null default now(),   -- Erstfassung, wichtig für § 17 MiLoG
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  unique (employee_id, day),
  check ((start1 is null) = (end1 is null)),
  check ((start2 is null) = (end2 is null)),
  check (end1 is null or end1 > start1),
  check (end2 is null or end2 > start2),
  check (start2 is null or start1 is not null),
  check (start2 is null or start2 >= end1)
);

-- ---------- Monatsabschluss -----------------------------------------
-- Fehlt eine Zeile, gilt der Monat als "offen". Schreiben nur über RPC-Funktionen.
create table public.month_closings (
  employee_id      uuid not null references public.employees(id),
  year             integer not null check (year between 2020 and 2100),
  month            integer not null check (month between 1 and 12),
  status           public.month_status not null default 'offen',
  submitted_at     timestamptz,
  submitted_by     uuid,
  released_at      timestamptz,
  released_by      uuid,
  returned_at      timestamptz,
  returned_by      uuid,
  return_reason    text,
  acknowledged_at  timestamptz,
  acknowledged_by  uuid,
  -- Stand bei Freigabe: ist_min, soll_min, diff_min, carry_in_min, carry_out_min,
  -- urlaub_tage, verdienst_cent, verdienst_jahr_cent
  summary          jsonb,
  primary key (employee_id, year, month)
);

-- ---------- Parameter (gültig ab) -----------------------------------
create table public.parameters (
  key         text not null,
  valid_from  date not null,
  value       numeric not null,
  note        text,
  primary key (key, valid_from)
);

-- ---------- Änderungsprotokoll --------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       uuid,
  actor_role  public.app_role,
  table_name  text not null,
  action      text not null,
  row_key     jsonb,
  old_row     jsonb,
  new_row     jsonb,
  reason      text
);
create index audit_log_at_idx    on public.audit_log (at desc);
create index audit_log_table_idx on public.audit_log (table_name, at desc);
create index time_entries_day_idx on public.time_entries (day);
