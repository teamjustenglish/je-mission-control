import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type UserRole = 'admin' | 'moderator' | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: { id: string; email: string; name: string; role: string } | null;
  role: UserRole;
  loading: boolean;        // initial session check
  roleLoading: boolean;    // profile/role fetch in progress
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthContextType['profile']>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);

  const fetchProfile = async (userId: string) => {
    setRoleLoading(true);
    try {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('fetchProfile error', error);
        setProfile(null);
        setRole(null);
      } else if (profileData) {
        setProfile(profileData);
        setRole(profileData.role as UserRole);
        // Fire-and-forget last_sign_in update — do not block on it
        supabase
          .from('profiles')
          .update({ last_sign_in: new Date().toISOString() } as any)
          .eq('id', userId)
          .then(({ error: updErr }) => {
            if (updErr) console.error('last_sign_in update failed', updErr);
          });
      } else {
        setProfile(null);
        setRole(null);
      }
    } catch (e) {
      console.error('fetchProfile threw', e);
      setProfile(null);
      setRole(null);
    } finally {
      setRoleLoading(false);
    }
  };

  useEffect(() => {
    // 1. Subscribe to auth state changes. CRITICAL: do not await any DB call
    //    inside this callback — it can deadlock the supabase client.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          setRoleLoading(true);
          // Defer the profile fetch so it does not run inside the auth callback
          setTimeout(() => {
            fetchProfile(newSession.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRole(null);
          setRoleLoading(false);
        }
      }
    );

    // 2. Initial session check on mount.
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setUser(existingSession?.user ?? null);
      if (existingSession?.user) {
        setRoleLoading(true);
        fetchProfile(existingSession.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    return { error };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('signOut error', e);
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
    setRoleLoading(false);
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('sb-') || k.includes('supabase')) localStorage.removeItem(k);
      });
    } catch {}
    window.location.href = '/';
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, role, loading, roleLoading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
