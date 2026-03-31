import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const LoginPage: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'invite'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [codeVerified, setCodeVerified] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      setError(error.message);
    }
  };

  const handleVerifyCode = async () => {
    setError('');
    setLoading(true);
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'invite_code')
      .single();
    setLoading(false);
    if (data && data.value === inviteCode) {
      setCodeVerified(true);
    } else {
      setError('Invalid invite code');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signUp(email, password, name);
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setMode('login');
      setError('Account created! Please log in.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-foreground mb-1">BatchTrack</h1>
        <p className="text-muted-foreground text-sm mb-6">
          {mode === 'login' ? 'Sign in to your account' : 'Create a moderator account'}
        </p>

        {error && (
          <div className={`text-sm mb-4 p-3 rounded-md ${error.includes('created') ? 'bg-success-bg text-success-text' : 'bg-danger-bg text-danger-text'}`}>
            {error}
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : !codeVerified ? (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Enter invite code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
            />
            <button
              onClick={handleVerifyCode}
              disabled={loading || !inviteCode}
              className="w-full py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Verifying…' : 'Verify code'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSignup} className="space-y-3">
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
              required
            />
            <input
              type="password"
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
              required
              minLength={6}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        )}

        <button
          onClick={() => { setMode(mode === 'login' ? 'invite' : 'login'); setError(''); setCodeVerified(false); }}
          className="mt-4 text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === 'login' ? 'Have an invite code? Sign up' : '← Back to login'}
        </button>
      </div>
    </div>
  );
};

export default LoginPage;
