import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const LoginPage: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'activate' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) setError(error.message);
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const { data: codeRow, error: codeErr } = await supabase
        .from('moderator_codes')
        .select('*')
        .eq('email', email)
        .eq('code', accessCode)
        .eq('used', false)
        .maybeSingle();
      if (codeErr) throw new Error('Something went wrong, please try again');
      if (!codeRow) throw new Error('Invalid or already used access code');

      const tempPw = (codeRow as any).temp_password;
      if (!tempPw) throw new Error('Something went wrong, please try again');
      const { error: tempSignInErr } = await supabase.auth.signInWithPassword({ email, password: tempPw });
      if (tempSignInErr) throw new Error('Something went wrong, please try again');

      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw new Error('Something went wrong, please try again');

      await supabase.from('moderator_codes').update({ used: true } as any).eq('id', codeRow.id);

      await supabase.auth.signOut();
      const { error: finalSignInErr } = await signIn(email, password);
      if (finalSignInErr) throw finalSignInErr;
    } catch (err: any) {
      setError(err.message || 'Activation failed');
    }
    setLoading(false);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      // Step 1: Validate the code
      const { data: codeRow, error: codeErr } = await supabase
        .from('moderator_codes')
        .select('*')
        .eq('email', email)
        .eq('code', accessCode)
        .eq('used', false)
        .maybeSingle();
      if (codeErr) throw new Error('Something went wrong, please try again');
      if (!codeRow) throw new Error('Invalid or expired code');

      // Step 2: Sign in with temp password
      const tempPw = (codeRow as any).temp_password;
      if (!tempPw) throw new Error('Something went wrong, please try again');
      const { error: tempSignInErr } = await supabase.auth.signInWithPassword({ email, password: tempPw });
      if (tempSignInErr) throw new Error('Invalid or expired code');

      // Step 3: Update to new password
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw new Error('Something went wrong, please try again');

      // Step 4: Mark code as used
      await supabase.from('moderator_codes').update({ used: true } as any).eq('id', codeRow.id);

      // Step 5: Sign out and re-sign in
      await supabase.auth.signOut();
      const { error: finalSignInErr } = await signIn(email, password);
      if (finalSignInErr) throw finalSignInErr;
    } catch (err: any) {
      setError(err.message || 'Password reset failed');
    }
    setLoading(false);
  };

  const inputStyle: React.CSSProperties = {
    background: 'hsl(var(--input-bg))',
    border: '1px solid hsl(var(--input-border))',
    borderRadius: 7,
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-foreground mb-1">Mission Control</h1>
        <p className="text-muted-foreground text-sm mb-6">
          {mode === 'login' ? 'Sign in to your account' : mode === 'activate' ? 'Activate your moderator account' : 'Reset your password'}
        </p>

        {error && (
          <div className="text-sm mb-4 p-3 rounded-md" style={{ background: 'hsl(var(--danger-bg))', color: 'hsl(var(--danger-text))' }}>
            {error}
          </div>
        )}
        {success && (
          <div className="text-sm mb-4 p-3 rounded-md" style={{ background: 'hsl(var(--success-bg))', color: 'hsl(var(--success-text))' }}>
            {success}
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-3">
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground" style={inputStyle} required />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground" style={inputStyle} required />
            <button type="submit" disabled={loading}
              className="w-full py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : mode === 'activate' ? (
          <form onSubmit={handleActivate} className="space-y-3">
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground" style={inputStyle} required />
            <input type="text" placeholder="Access code (e.g. BT-X7K2PQ)" value={accessCode} onChange={(e) => setAccessCode(e.target.value)}
              className="w-full px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground" style={inputStyle} required />
            <input type="password" placeholder="Set your password (min 6 characters)" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground" style={inputStyle} required minLength={6} />
            <button type="submit" disabled={loading}
              className="w-full py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {loading ? 'Activating…' : 'Activate account'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="space-y-3">
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground" style={inputStyle} required />
            <input type="text" placeholder="New access code (from admin)" value={accessCode} onChange={(e) => setAccessCode(e.target.value)}
              className="w-full px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground" style={inputStyle} required />
            <input type="password" placeholder="New password (min 6 characters)" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground" style={inputStyle} required minLength={6} />
            <button type="submit" disabled={loading}
              className="w-full py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {loading ? 'Resetting…' : 'Reset password'}
            </button>
          </form>
        )}

        <div className="mt-4 space-y-1">
          {mode === 'login' && (
            <>
              <button onClick={() => { setMode('activate'); setError(''); setSuccess(''); }}
                className="block text-sm text-muted-foreground hover:text-foreground">
                First time? Activate account
              </button>
              <button onClick={() => { setMode('reset'); setError(''); setSuccess(''); }}
                className="block text-sm text-muted-foreground hover:text-foreground">
                Forgot password? Reset it
              </button>
            </>
          )}
          {(mode === 'activate' || mode === 'reset') && (
            <button onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
              className="text-sm text-muted-foreground hover:text-foreground">
              ← Back to login
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
