// Typen entsprechend den Tabellen in supabase/migrations
import type { IsoDate } from './dates';

export type AppRole = 'mitarbeiter' | 'leitung' | 'vorstand';
export type ModelKind = 'vollzeit' | 'stellenteilung' | 'minijob_vertretung' | 'minijob_alltagshilfe';
export type DayType = 'arbeit' | 'urlaub' | 'halber_urlaub' | 'krank' | 'feiertag' | 'ueberstundenausgleich';
export type MonthStatus = 'offen' | 'eingereicht' | 'freigegeben' | 'zurueckgegeben';

export const DAY_TYPE_LABEL: Record<DayType, string> = {
  arbeit: 'Arbeit',
  urlaub: 'Urlaub',
  halber_urlaub: 'Halber Urlaubstag',
  krank: 'Krank',
  feiertag: 'Feiertag',
  ueberstundenausgleich: 'Überstundenausgleich',
};

export const STATUS_LABEL: Record<MonthStatus, string> = {
  offen: 'offen',
  eingereicht: 'eingereicht',
  freigegeben: 'freigegeben',
  zurueckgegeben: 'zurückgegeben',
};

export const MODEL_LABEL: Record<ModelKind, string> = {
  vollzeit: 'Vollzeit',
  stellenteilung: 'Stellenteilung',
  minijob_vertretung: 'Minijob Vertretung',
  minijob_alltagshilfe: 'Minijob Alltagshilfe',
};

export const isMinijob = (k: ModelKind) => k === 'minijob_vertretung' || k === 'minijob_alltagshilfe';

export interface Employee {
  id: string;
  pseudonym: string;
  active: boolean;
}

export interface Profile {
  user_id: string;
  role: AppRole;
  employee_id: string | null;
  is_admin: boolean;
}

export interface EmploymentTerms {
  id?: string;
  employee_id: string;
  valid_from: IsoDate;
  kind: ModelKind;
  weekly_minutes: number | null;
  /** Index 0 = Montag … 6 = Sonntag */
  plan_minutes: number[];
  monday_biweekly_from: IsoDate | null;
  fixed_start: string | null;
  fixed_end: string | null;
  vacation_days_per_year: number | null;
  hourly_wage_cents: number | null;
}

export interface YearBalance {
  employee_id: string;
  year: number;
  carry_minutes: number;
  carry_vacation_days: number;
}

export interface ScheduleDay {
  employee_id: string;
  day: IsoDate;
  plan_minutes: number;
  fixed_start: string | null;
  fixed_end: string | null;
  is_holiday: boolean;
  is_override: boolean;
  note: string | null;
}

export interface TimeEntry {
  id?: string;
  employee_id: string;
  day: IsoDate;
  day_type: DayType;
  start1: string | null;
  end1: string | null;
  start2: string | null;
  end2: string | null;
  break_minutes: number | null;
  note: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MonthSummary {
  ist_min: number;
  soll_min: number;
  diff_min: number;
  carry_in_min: number;
  carry_out_min: number;
  urlaub_tage: number;
  verdienst_cent: number | null;
  verdienst_jahr_cent: number | null;
}

export interface MonthClosing {
  employee_id: string;
  year: number;
  month: number;
  status: MonthStatus;
  submitted_at: string | null;
  released_at: string | null;
  released_by: string | null;
  returned_at: string | null;
  return_reason: string | null;
  acknowledged_at: string | null;
  summary: MonthSummary | null;
}

export interface Parameter {
  key: string;
  valid_from: IsoDate;
  value: number;
}
