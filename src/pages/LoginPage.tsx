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
      const { data, error: fnError } = await supabase.functions.invoke('activate-moderator', {
        body: { email, code: accessCode, password },
      });
      if (fnError) throw fnError;
      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (result.error) throw new Error(result.error);
      setSuccess('Account activated! You can now sign in.');
      setMode('login');
      setAccessCode('');
      setPassword('');
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
