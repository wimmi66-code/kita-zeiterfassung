-- =====================================================================
-- Migration 3: Rechte und Row Level Security
-- Grundsatz: anon darf nichts. authenticated darf nur, was eine Policy
-- ausdrücklich erlaubt. Statuswechsel nur über RPC-Funktionen.
-- =====================================================================

-- ---------- RLS auf allen Tabellen ----------------------------------
alter table public.employees           enable row level security;
alter table public.employee_identities enable row level security;
alter table public.profiles            enable row level security;
alter table public.employment_terms    enable row level security;
alter table public.year_balances       enable row level security;
alter table public.schedule_days       enable row level security;
alter table public.time_entries        enable row level security;
alter table public.month_closings      enable row level security;
alter table public.parameters          enable row level security;
alter table public.audit_log           enable row level security;

-- ---------- Grundrechte ---------------------------------------------
-- Supabase vergibt standardmäßig volle Rechte an anon und authenticated.
-- Wir entziehen alles und vergeben danach gezielt.
revoke all on all tables    in schema public from anon, authenticated, public;
revoke all on all sequences in schema public from anon, authenticated, public;
revoke all on all functions in schema public from anon, authenticated, public;
revoke all on all functions in schema app    from anon, authenticated, public;
alter default privileges in schema public revoke all on tables    from anon, public;
alter default privileges in schema public revoke all on functions from anon, public;

grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;

grant select                         on public.employees           to authenticated;
grant insert, update                 on public.employees           to authenticated;
grant select, insert, update, delete on public.employee_identities to authenticated;
grant select                         on public.profiles            to authenticated;
grant select, insert, update, delete on public.employment_terms    to authenticated;
grant select, insert, update, delete on public.year_balances       to authenticated;
grant select, insert, update, delete on public.schedule_days       to authenticated;
grant select, insert, update, delete on public.time_entries        to authenticated;
grant select                         on public.month_closings      to authenticated;
grant select, insert, update         on public.parameters          to authenticated;
grant select                         on public.audit_log           to authenticated;

grant execute on function
  public.reviewable_employees(),
  public.submit_month(int, int),
  public.release_month(uuid, int, int, jsonb),
  public.return_month(uuid, int, int, text),
  public.acknowledge_month(uuid, int, int),
  public.correct_entry(uuid, date, public.day_type, time, time, time, time, int, text, text),
  public.correct_delete_entry(uuid, date, text),
  public.leitung_set_schedule_day(uuid, date, int, text, text),
  public.update_summary(uuid, int, int, jsonb, text)
to authenticated;

-- ---------- employees (Pseudonyme) ----------------------------------
create policy employees_select on public.employees for select to authenticated
  using (id = (select app.my_employee()) or (select app.is_leitung()) or (select app.is_vorstand()));
create policy employees_insert on public.employees for insert to authenticated
  with check ((select app.is_leitung()));
create policy employees_update on public.employees for update to authenticated
  using ((select app.is_leitung())) with check ((select app.is_leitung()));

-- ---------- employee_identities (Klarnamen) – nur Leitung -----------
create policy identities_all on public.employee_identities for all to authenticated
  using ((select app.is_leitung())) with check ((select app.is_leitung()));

-- ---------- profiles – eigene Zeile, Leitung alle; kein Schreiben ---
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select app.is_leitung()));

-- ---------- employment_terms / year_balances ------------------------
create policy terms_select on public.employment_terms for select to authenticated
  using (employee_id = (select app.my_employee()) or (select app.is_leitung()) or app.admin_sees(employee_id));
create policy terms_write on public.employment_terms for all to authenticated
  using ((select app.is_leitung())) with check ((select app.is_leitung()));

create policy balances_select on public.year_balances for select to authenticated
  using (employee_id = (select app.my_employee()) or (select app.is_leitung()) or app.admin_sees(employee_id));
create policy balances_write on public.year_balances for all to authenticated
  using ((select app.is_leitung())) with check ((select app.is_leitung()));

-- ---------- schedule_days (Dienstplan) ------------------------------
create policy schedule_select on public.schedule_days for select to authenticated
  using (employee_id = (select app.my_employee())
         or (select app.is_leitung())
         or app.admin_sees(employee_id)
         or ((select app.is_vorstand()) and app.month_status(employee_id, day) = 'freigegeben'));
create policy schedule_write on public.schedule_days for all to authenticated
  using ((select app.is_leitung())) with check ((select app.is_leitung()));

-- ---------- time_entries --------------------------------------------
create policy entries_select on public.time_entries for select to authenticated
  using (employee_id = (select app.my_employee())
         or (select app.is_leitung())
         or app.admin_sees(employee_id)
         or ((select app.is_vorstand()) and app.month_status(employee_id, day) = 'freigegeben'));

-- Direktes Schreiben nur für eigene Einträge in offenen Monaten.
-- Fremde Einträge korrigiert die prüfende Person über correct_entry().
create policy entries_insert on public.time_entries for insert to authenticated
  with check (employee_id = (select app.my_employee()) and app.month_is_editable(employee_id, day));
create policy entries_update on public.time_entries for update to authenticated
  using      (employee_id = (select app.my_employee()) and app.month_is_editable(employee_id, day))
  with check (employee_id = (select app.my_employee()) and app.month_is_editable(employee_id, day));
create policy entries_delete on public.time_entries for delete to authenticated
  using (employee_id = (select app.my_employee()) and app.month_is_editable(employee_id, day));

-- ---------- month_closings – nur lesen, Schreiben über RPC ----------
create policy closings_select on public.month_closings for select to authenticated
  using (employee_id = (select app.my_employee())
         or (select app.is_leitung())
         or app.admin_sees(employee_id)
         or ((select app.is_vorstand()) and status = 'freigegeben'));

-- ---------- parameters ----------------------------------------------
create policy parameters_select on public.parameters for select to authenticated using (true);
create policy parameters_insert on public.parameters for insert to authenticated
  with check ((select app.is_leitung()));
create policy parameters_update on public.parameters for update to authenticated
  using ((select app.is_leitung())) with check ((select app.is_leitung()));

-- ---------- audit_log – nur Leitung liest; geschrieben wird per Trigger
create policy audit_select on public.audit_log for select to authenticated
  using ((select app.is_leitung()));
