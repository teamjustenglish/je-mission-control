import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const DISCORD_URL = 'https://discord.com/users/justenglish';

const InviteSignupPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setChecking(false); return; }
    supabase.rpc('check_invite_token', { p_token: token }).then(({ data }) => {
      setValid(!!data);
      setChecking(false);
    });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setError('');
    setLoading(true);

    const { data, error: signUpErr } = await supabase.auth.signUp({ email, password });
    if (signUpErr) { setError(signUpErr.message); setLoading(false); return; }

    if (!data.session) {
      // Email confirmation is required — profile setup happens after they confirm
      setDone(true);
      setLoading(false);
      return;
    }

    const { error: profileErr } = await (supabase as any).from('profiles').insert({
      id: data.user!.id,
      email,
      name: displayName,
      role: 'moderator',
    });
    if (profileErr) { setError(profileErr.message); setLoading(false); return; }

    const { data: rpcResult } = await supabase.rpc('setup_invite_account', { p_token: token! });
    if (rpcResult !== 'ok') {
      setError('Account setup failed — the invite may have just been revoked. Reach Dave on Discord.');
      setLoading(false);
      return;
    }

    await supabase.auth.signOut();
    setDone(true);
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

        {checking ? (
          <p className="text-muted-foreground text-sm">Checking invite…</p>
        ) : !valid ? (
          <>
            <p className="text-muted-foreground text-sm mb-4">This invite link is no longer active.</p>
            <p className="text-sm text-muted-foreground">
              Reach Dave on{' '}
              <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                Discord
              </a>{' '}
              for a new one.
            </p>
          </>
        ) : done ? (
          <>
            <p className="text-muted-foreground text-sm mb-6">You're in.</p>
            <div className="text-sm mb-4 p-3 rounded-md" style={{ background: 'hsl(var(--success-bg))', color: 'hsl(var(--success-text))' }}>
              Account created — sign in to get started.
            </div>
            <a href="/" className="block text-sm text-muted-foreground hover:text-foreground">← Sign in</a>
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-sm mb-6">Create your moderator account</p>
            {error && (
              <div className="text-sm mb-4 p-3 rounded-md" style={{ background: 'hsl(var(--danger-bg))', color: 'hsl(var(--danger-text))' }}>
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
              <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                style={inputStyle} required />
              <div>
                <input type="text" placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                  style={inputStyle} required />
                <p className="text-xs text-muted-foreground mt-1 ml-0.5">How mods and students will see you</p>
              </div>
              <input type="password" placeholder="Password (min 6 characters)" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                style={inputStyle} required minLength={6} />
              <input type="password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                style={inputStyle} required />
              <button type="submit" disabled={loading}
                className="w-full py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {loading ? 'Creating account…' : 'Create my account'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default InviteSignupPage;
