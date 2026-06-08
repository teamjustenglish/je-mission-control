import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const ResetPasswordPage: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    // Supabase detects the recovery token in the URL hash and fires PASSWORD_RECOVERY
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setSessionReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true);
    setError('');
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateErr) { setError(updateErr.message); return; }
    await supabase.auth.signOut();
    setDone(true);
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

        {done ? (
          <>
            <p className="text-muted-foreground text-sm mb-6">Password updated.</p>
            <div className="text-sm mb-4 p-3 rounded-md" style={{ background: 'hsl(var(--success-bg))', color: 'hsl(var(--success-text))' }}>
              Password updated — sign in to get started.
            </div>
            <a href="/" className="block text-sm text-muted-foreground hover:text-foreground">← Sign in</a>
          </>
        ) : !sessionReady ? (
          <>
            <p className="text-muted-foreground text-sm mb-4">Verifying reset link…</p>
            <p className="text-sm text-muted-foreground">
              If this takes too long, your link may have expired.{' '}
              <a href="/" className="underline hover:text-foreground">Request a new one</a>.
            </p>
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-sm mb-6">Choose a new password</p>
            {error && (
              <div className="text-sm mb-4 p-3 rounded-md" style={{ background: 'hsl(var(--danger-bg))', color: 'hsl(var(--danger-text))' }}>
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
              <input type="password" placeholder="New password (min 6 characters)" value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                style={inputStyle} required minLength={6} />
              <input type="password" placeholder="Confirm new password" value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                style={inputStyle} required />
              <button type="submit" disabled={loading}
                className="w-full py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordPage;
