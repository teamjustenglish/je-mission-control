import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const AdminLoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
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

  const inputStyle: React.CSSProperties = {
    background: 'hsl(var(--input-bg))',
    border: '1px solid hsl(var(--input-border))',
    borderRadius: 7,
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-foreground mb-1">Mission Control Admin</h1>
        <p className="text-muted-foreground text-sm mb-6">Sign in to the admin dashboard</p>

        {error && (
          <div className="text-sm mb-4 p-3 rounded-md" style={{ background: 'hsl(var(--danger-bg))', color: 'hsl(var(--danger-text))' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-3">
          <input type="email" placeholder="Admin email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground" style={inputStyle} required />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground" style={inputStyle} required />
          <button type="submit" disabled={loading}
            className="w-full py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminLoginPage;
