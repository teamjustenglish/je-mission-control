import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const LoginPage: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'activate'>('login');
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
      // Step 1: Validate code
      const { data: codeRow, error: codeErr } = await supabase
        .from('moderator_codes')
        .select('*')
        .eq('email', email)
        .eq('code', accessCode)
        .eq('used', false)
        .maybeSingle();
      if (codeErr) throw new Error('Something went wrong, please try again');
      if (!codeRow) throw new Error('Invalid or already used access code');

      // Step 2: Sign in with temp password to gain auth, then update password
      const tempPw = (codeRow as any).temp_password;
      if (!tempPw) throw new Error('Something went wrong, please try again');
      const { error: tempSignInErr } = await supabase.auth.signInWithPassword({ email, password: tempPw });
      if (tempSignInErr) throw new Error('Something went wrong, please try again');

      // Step 3: Update to new password (as signed-in user)
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw new Error('Something went wrong, please try again');

      // Step 4: Mark code as used
      await supabase.from('moderator_codes').update({ used: true } as any).eq('id', codeRow.id);

      // Step 5: Sign out and re-sign in with new password for clean session
      await supabase.auth.signOut();
      const { error: finalSignInErr } = await signIn(email, password);
      if (finalSignInErr) throw finalSignInErr;
      // Auth context will handle redirect
    } catch (err: any) {
      setError(err.message || 'Activation failed');
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
        <h1 className="text-2xl font-semibold text-foreground mb-1">BatchTrack</h1>
        <p className="text-muted-foreground text-sm mb-6">
          {mode === 'login' ? 'Sign in to your account' : 'Activate your moderator account'}
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
        ) : (
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
        )}

        <button onClick={() => { setMode(mode === 'login' ? 'activate' : 'login'); setError(''); setSuccess(''); }}
          className="mt-4 text-sm text-muted-foreground hover:text-foreground">
          {mode === 'login' ? 'First time? Activate account' : '← Back to login'}
        </button>
      </div>
    </div>
  );
};

export default LoginPage;
