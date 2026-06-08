import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const LoginPage: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'activate' | 'reset' | 'forgotPassword'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, user, profile, signOut } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) setError(error.message);
  };

  const activateOrReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      // Make sure no stale session interferes with the new sign-in
      await supabase.auth.signOut();

      const { data, error: fnErr } = await supabase.functions.invoke('activate-moderator', {
        body: { email, code: accessCode, password },
      });
      if (fnErr) throw new Error(fnErr.message || 'Activation failed');
      if (data?.error) throw new Error(data.error);

      const { error: finalSignInErr } = await signIn(email, password);
      if (finalSignInErr) throw finalSignInErr;
    } catch (err: any) {
      setError(err.message || (mode === 'reset' ? 'Password reset failed' : 'Activation failed'));
    }
    setLoading(false);
  };

  const handleActivate = activateOrReset;
  const handleReset = activateOrReset;

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSuccess('Check your email for a reset link. Click it to set a new password.');
    }
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
          {mode === 'login' ? 'Sign in to your account' : mode === 'activate' ? 'Activate your moderator account' : mode === 'forgotPassword' ? 'Reset your password' : 'Reset your password'}
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
        ) : mode === 'forgotPassword' ? (
          <form onSubmit={handleForgotPassword} className="space-y-3">
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground" style={inputStyle} required />
            <button type="submit" disabled={loading}
              className="w-full py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="space-y-3">
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground" style={inputStyle} required />
            <input type="text" placeholder="Access code (from Dave)" value={accessCode} onChange={(e) => setAccessCode(e.target.value)}
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
              <button onClick={() => { setMode('forgotPassword'); setError(''); setSuccess(''); }}
                className="block text-sm text-muted-foreground hover:text-foreground">
                Forgot password?
              </button>
            </>
          )}
          {mode === 'forgotPassword' && (
            <>
              <button onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                className="block text-sm text-muted-foreground hover:text-foreground">
                ← Back to sign in
              </button>
              <button onClick={() => { setMode('reset'); setError(''); setSuccess(''); }}
                className="block text-sm text-muted-foreground hover:text-foreground">
                Have a reset code from Dave?
              </button>
            </>
          )}
          {(mode === 'activate' || mode === 'reset') && (
            <button onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
              className="text-sm text-muted-foreground hover:text-foreground">
              ← Back to sign in
            </button>
          )}
          {user && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
              <span>Signed in as</span>
              <span className="truncate min-w-0 max-w-[180px]">{profile?.email || 'another user'}</span>
              <span>.</span>
              <button onClick={signOut} className="underline hover:text-foreground shrink-0">
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
