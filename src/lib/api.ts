// Datenzugriffe auf Supabase. Rechte prüft die Datenbank (RLS), nicht das Frontend.
import { supabase } from './supabase';
import { makeDate, type IsoDate } from './dates';
import { generateSchedule, planDay } from './schedule';
import type {
  Employee, EmploymentTerms, MonthClosing, MonthSummary, Parameter, Profile, ScheduleDay, TimeEntry, YearBalance,
} from './types';

function check<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

// ---------- Mitarbeitende / Klarnamen ----------------------------------
export interface EmployeeRow extends Employee {
  first_name: string | null;
  last_name: string | null;
  has_account: boolean;
  role: Profile['role'] | null;
}

export async function loadEmployees(): Promise<EmployeeRow[]> {
  const [emps, ids, profs] = await Promise.all([
    supabase.from('employees').select('id, pseudonym, active').order('pseudonym'),
    supabase.from('employee_identities').select('employee_id, first_name, last_name'),
    supabase.from('profiles').select('employee_id, role'),
  ]);
  const e = check(emps) as Employee[];
  const i = (check(ids) ?? []) as { employee_id: string; first_name: string; last_name: string }[];
  const p = (check(profs) ?? []) as { employee_id: string | null; role: Profile['role'] }[];
  return e.map((x) => {
    const id = i.find((r) => r.employee_id === x.id);
    const pr = p.find((r) => r.employee_id === x.id);
    return {
      ...x,
      first_name: id?.first_name ?? null,
      last_name: id?.last_name ?? null,
      has_account: !!pr,
      role: pr?.role ?? null,
    };
  });
}

export function nextPseudonym(existing: string[]): string {
  for (let n = 1; n < 100; n++) {
    const p = `MA-${String(n).padStart(2, '0')}`;
    if (!existing.includes(p)) return p;
  }
  throw new Error('Keine freien Pseudonyme mehr');
}

export async function createEmployee(pseudonym: string): Promise<Employee> {
  return check(await supabase.from('employees').insert({ pseudonym }).select().single()) as Employee;
}

export async function setEmployeeActive(id: string, active: boolean) {
  check(await supabase.from('employees').update({ active }).eq('id', id));
}

export async function saveIdentity(employee_id: string, first_name: string, last_name: string) {
  if (!first_name.trim() && !last_name.trim()) {
    check(await supabase.from('employee_identities').delete().eq('employee_id', employee_id));
    return;
  }
  check(await supabase.from('employee_identities')
    .upsert({ employee_id, first_name: first_name.trim(), last_name: last_name.trim() }));
}

// ---------- Arbeitszeitmodelle -----------------------------------------
export async function loadTerms(employee_id: string): Promise<EmploymentTerms[]> {
  const rows = check(await supabase.from('employment_terms').select('*')
    .eq('employee_id', employee_id).order('valid_from')) as EmploymentTerms[];
  return rows.map((r) => ({ ...r, vacation_days_per_year: r.vacation_days_per_year === null ? null : Number(r.vacation_days_per_year) }));
}

export async function saveTerms(t: EmploymentTerms) {
  const { id, ...rest } = t;
  if (id) check(await supabase.from('employment_terms').update(rest).eq('id', id));
  else check(await supabase.from('employment_terms').insert(rest));
}

export async function deleteTerms(id: string) {
  check(await supabase.from('employment_terms').delete().eq('id', id));
}

// ---------- Jahreswerte ------------------------------------------------
export async function loadBalance(employee_id: string, year: number): Promise<YearBalance | null> {
  const r = check(await supabase.from('year_balances').select('*')
    .eq('employee_id', employee_id).eq('year', year).maybeSingle()) as YearBalance | null;
  return r ? { ...r, carry_vacation_days: Number(r.carry_vacation_days) } : null;
}

export async function saveBalance(b: YearBalance) {
  check(await supabase.from('year_balances').upsert(b));
}

// ---------- Parameter --------------------------------------------------
export async function loadParameters(): Promise<Parameter[]> {
  return check(await supabase.from('parameters').select('key, valid_from, value')) as Parameter[];
}

// ---------- Monatsabschlüsse ------------------------------------------
export async function loadClosings(employee_id: string | null, year: number): Promise<MonthClosing[]> {
  let q = supabase.from('month_closings').select('*').eq('year', year);
  if (employee_id) q = q.eq('employee_id', employee_id);
  return check(await q) as MonthClosing[];
}

// ---------- Dienstplan -------------------------------------------------
export async function loadSchedule(employee_id: string, from: IsoDate, to: IsoDate): Promise<ScheduleDay[]> {
  return check(await supabase.from('schedule_days').select('*')
    .eq('employee_id', employee_id).gte('day', from).lte('day', to).order('day')) as ScheduleDay[];
}

/** Dienstplan eines Jahres aus den Modellen erzeugen. Überschriebene Tage und freigegebene Monate bleiben unberührt. */
export async function regenerateYear(employee_id: string, year: number): Promise<number> {
  const from = makeDate(year, 1, 1);
  const to = makeDate(year, 12, 31);
  const [terms, existing, closings] = await Promise.all([
    loadTerms(employee_id), loadSchedule(employee_id, from, to), loadClosings(employee_id, year),
  ]);
  const locked = new Set(closings.filter((c) => c.status === 'freigegeben').map((c) => c.month));
  const rows = generateSchedule(employee_id, terms, from, to, existing,
    (d) => locked.has(Number(d.slice(5, 7))));
  for (let i = 0; i < rows.length; i += 200) {
    check(await supabase.from('schedule_days')
      .upsert(rows.slice(i, i + 200).map(({ employee_id: e, day, plan_minutes, fixed_start, fixed_end, is_holiday, is_override, note }) =>
        ({ employee_id: e, day, plan_minutes, fixed_start, fixed_end, is_holiday, is_override, note })),
      { onConflict: 'employee_id,day' }));
  }
  return rows.length;
}

/** Einzelnen Tag überschreiben (z. B. Tauschtag). In freigegebenen Monaten mit Begründung. */
export async function overrideDay(
  employee_id: string, day: IsoDate, plan_minutes: number, note: string | null, reason?: string,
) {
  if (reason) {
    check(await supabase.rpc('leitung_set_schedule_day',
      { p_employee: employee_id, p_day: day, p_plan_minutes: plan_minutes, p_note: note, p_reason: reason }));
    return;
  }
  check(await supabase.from('schedule_days').upsert(
    { employee_id, day, plan_minutes, note, is_override: true }, { onConflict: 'employee_id,day' }));
}

/** Überschreibung aufheben: Tag wird wieder aus dem Modell berechnet. */
export async function resetOverride(employee_id: string, day: IsoDate) {
  const terms = await loadTerms(employee_id);
  const { plan_minutes, fixed_start, fixed_end, is_holiday, note } = planDay(employee_id, terms, day);
  check(await supabase.from('schedule_days').upsert(
    { employee_id, day, plan_minutes, fixed_start, fixed_end, is_holiday, note, is_override: false },
    { onConflict: 'employee_id,day' }));
}

// ---------- Zeiteinträge -----------------------------------------------
export async function loadEntries(employee_id: string, from: IsoDate, to: IsoDate): Promise<TimeEntry[]> {
  const rows = check(await supabase.from('time_entries').select('*')
    .eq('employee_id', employee_id).gte('day', from).lte('day', to).order('day')) as TimeEntry[];
  const t = (x: string | null) => (x ? x.slice(0, 5) : null);
  return rows.map((r) => ({ ...r, start1: t(r.start1), end1: t(r.end1), start2: t(r.start2), end2: t(r.end2) }));
}

/** Eigenen Eintrag speichern (nur in offenen Monaten; prüft die Datenbank). */
export async function saveOwnEntry(e: TimeEntry) {
  const { employee_id, day, day_type, start1, end1, start2, end2, break_minutes, note } = e;
  check(await supabase.from('time_entries').upsert(
    { employee_id, day, day_type, start1, end1, start2, end2, break_minutes, note },
    { onConflict: 'employee_id,day' }));
}

export async function deleteOwnEntry(employee_id: string, day: IsoDate) {
  check(await supabase.from('time_entries').delete().eq('employee_id', employee_id).eq('day', day));
}

export async function submitMonth(year: number, month: number) {
  check(await supabase.rpc('submit_month', { p_year: year, p_month: month }));
}

/** Alles, was für die Monatsansicht einer Person nötig ist (ganzes Jahr wegen Übertrag). */
export async function loadYearData(employee_id: string, year: number) {
  const from = makeDate(year, 1, 1);
  const to = makeDate(year, 12, 31);
  const [terms, schedule, entries, balance, closings, params] = await Promise.all([
    loadTerms(employee_id), loadSchedule(employee_id, from, to), loadEntries(employee_id, from, to),
    loadBalance(employee_id, year), loadClosings(employee_id, year), loadParameters(),
  ]);
  return { terms, schedule, entries, balance, closings, params };
}
export type YearData = Awaited<ReturnType<typeof loadYearData>>;

// ---------- Prüfung und Freigabe ---------------------------------------
export async function reviewableEmployees(): Promise<Employee[]> {
  return check(await supabase.rpc('reviewable_employees')) as Employee[];
}

/** Klarnamen (nur für die Leitung lesbar; für andere leer). */
export async function loadIdentityMap(): Promise<Map<string, string>> {
  const { data } = await supabase.from('employee_identities').select('employee_id, first_name, last_name');
  return new Map((data ?? []).map((r: { employee_id: string; first_name: string; last_name: string }) =>
    [r.employee_id, `${r.first_name} ${r.last_name}`.trim()]));
}

export async function correctEntry(e: TimeEntry, reason: string) {
  check(await supabase.rpc('correct_entry', {
    p_employee: e.employee_id, p_day: e.day, p_day_type: e.day_type,
    p_start1: e.start1, p_end1: e.end1, p_start2: e.start2, p_end2: e.end2,
    p_break_minutes: e.break_minutes, p_note: e.note, p_reason: reason,
  }));
}

export async function correctDeleteEntry(employee_id: string, day: IsoDate, reason: string) {
  check(await supabase.rpc('correct_delete_entry', { p_employee: employee_id, p_day: day, p_reason: reason }));
}

export async function releaseMonth(employee_id: string, year: number, month: number, summary: MonthSummary) {
  check(await supabase.rpc('release_month', { p_employee: employee_id, p_year: year, p_month: month, p_summary: summary }));
}

export async function returnMonth(employee_id: string, year: number, month: number, reason: string) {
  check(await supabase.rpc('return_month', { p_employee: employee_id, p_year: year, p_month: month, p_reason: reason }));
}

export async function updateSummary(employee_id: string, year: number, month: number, summary: MonthSummary, reason: string) {
  check(await supabase.rpc('update_summary', { p_employee: employee_id, p_year: year, p_month: month, p_summary: summary, p_reason: reason }));
}

export async function acknowledgeMonth(employee_id: string, year: number, month: number) {
  check(await supabase.rpc('acknowledge_month', { p_employee: employee_id, p_year: year, p_month: month }));
}

export async function submitMonthFor(employee_id: string, year: number, month: number, reason: string) {
  check(await supabase.rpc('submit_month_for', { p_employee: employee_id, p_year: year, p_month: month, p_reason: reason }));
}

// ---------- Vorstand: freigegebene Monate --------------------------------
/** Alle für den Betrachter sichtbaren Abschlüsse eines Jahres (Vorstand: nur freigegebene). */
export async function loadReleasedYear(year: number) {
  const from = makeDate(year, 1, 1);
  const to = makeDate(year, 12, 31);
  const [emps, closings] = await Promise.all([
    supabase.from('employees').select('id, pseudonym, active').order('pseudonym'),
    supabase.from('month_closings').select('*').eq('year', year).eq('status', 'freigegeben'),
  ]);
  return {
    employees: check(emps) as Employee[],
    closings: check(closings) as MonthClosing[],
    from, to,
  };
}

/** Tageswerte eines freigegebenen Monats (RLS liefert dem Vorstand nur freigegebene Monate). */
export async function loadReleasedMonth(employee_id: string, year: number, month: number) {
  const from = makeDate(year, month, 1);
  const to = makeDate(year, month + 1, 0);
  const [schedule, entries] = await Promise.all([
    loadSchedule(employee_id, from, to), loadEntries(employee_id, from, to),
  ]);
  return { schedule, entries };
}
