import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import type { Employee, Profile } from './lib/types';

interface AuthState {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  employee: Employee | null;
  error: string | null;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setProfile(null);
      setEmployee(null);
      if (!session) {
        setLoading(false);
        return;
      }
      const { data: p, error: pe } = await supabase
        .from('profiles').select('user_id, role, employee_id, is_admin')
        .eq('user_id', session.user.id).maybeSingle();
      if (cancelled) return;
      if (pe) setError(pe.message);
      setProfile(p as Profile | null);
      if (p?.employee_id) {
        const { data: e } = await supabase
          .from('employees').select('id, pseudonym, active').eq('id', p.employee_id).maybeSingle();
        if (!cancelled) setEmployee(e as Employee | null);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [session?.user.id]);

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <Ctx.Provider value={{ loading, session, profile, employee, error, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth außerhalb von AuthProvider');
  return v;
}
