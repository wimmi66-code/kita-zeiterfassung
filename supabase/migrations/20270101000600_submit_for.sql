-- =====================================================================
-- Migration 6: Monat im Auftrag einreichen
-- Für Monate, die aus Papier-/Excel-Stundenzetteln übernommen wurden oder
-- wenn eine Person selbst nicht einreichen kann. Nur wer die Person prüft
-- (Leitung bzw. Admin-Vorstand für die Leitung), mit Pflichtbegründung.
-- =====================================================================
create or replace function public.submit_month_for(p_employee uuid, p_year int, p_month int, p_reason text)
returns public.month_closings
language plpgsql security definer set search_path = '' as $$
declare
  v_last date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  v_row public.month_closings;
begin
  if not app.can_review(p_employee) then
    raise exception 'Keine Berechtigung, für diese Person einzureichen.';
  end if;
  perform app.require_reason(p_reason);
  if current_date < v_last then
    raise exception 'Der Monat kann erst ab dem % eingereicht werden.', to_char(v_last, 'DD.MM.YYYY');
  end if;
  if not app.month_is_editable(p_employee, v_last) then
    raise exception 'Der Monat ist bereits %.', app.month_status(p_employee, v_last);
  end if;

  insert into public.month_closings (employee_id, year, month, status, submitted_at, submitted_by)
  values (p_employee, p_year, p_month, 'eingereicht', now(), auth.uid())
  on conflict (employee_id, year, month) do update
    set status = 'eingereicht', submitted_at = now(), submitted_by = auth.uid()
  returning * into v_row;
  return v_row;
end $$;

revoke all on function public.submit_month_for(uuid, int, int, text) from public, anon;
grant execute on function public.submit_month_for(uuid, int, int, text) to authenticated;
