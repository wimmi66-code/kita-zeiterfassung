-- Vorlage: Rollen zuweisen. Im Supabase SQL Editor ausführen, NICHT mit echten
-- Werten ins Repository einchecken. Die user_id steht unter Authentication → Users
-- oder wird nach der ersten Anmeldung in der App angezeigt.

-- 1) Pseudonym anlegen (falls noch nicht vorhanden)
insert into public.employees (pseudonym) values ('MA-01') on conflict (pseudonym) do nothing;

-- 2a) Leitung (mit eigenem Pseudonym, weil sie eigene Zeiten erfasst)
insert into public.profiles (user_id, role, employee_id)
select '<USER-ID>', 'leitung', id from public.employees where pseudonym = 'MA-01';

-- 2b) Mitarbeiter/in
-- insert into public.profiles (user_id, role, employee_id)
-- select '<USER-ID>', 'mitarbeiter', id from public.employees where pseudonym = 'MA-02';

-- 2c) Vorstand, Admin (gibt die Monate der Leitung frei)
-- insert into public.profiles (user_id, role, is_admin) values ('<USER-ID>', 'vorstand', true);

-- 2d) Vorstand ohne Admin
-- insert into public.profiles (user_id, role) values ('<USER-ID>', 'vorstand');

-- Rolle ändern
-- update public.profiles set role = 'mitarbeiter', is_admin = false where user_id = '<USER-ID>';
