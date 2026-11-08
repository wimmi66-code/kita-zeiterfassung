import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configMissing = !url || !anonKey;

export const supabase = createClient(url ?? 'http://invalid.local', anonKey ?? 'invalid', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Fehlermeldungen aus Supabase/PostgreSQL lesbar machen. */
export function errorText(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: string }).message);
  return String(e);
}
