import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const DISCORD_URL = 'https://discord.com/users/justenglish';
const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg'];

const getInitials = (name: string) =>
  name ? name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) : '';

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

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) { setChecking(false); return; }
    supabase.rpc('check_invite_token', { p_token: token }).then(({ data }) => {
      setValid(!!data);
      setChecking(false);
    });
  }, [token]);

  // Revoke the object URL when it changes or on unmount to avoid leaks.
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const acceptFile = (file: File | undefined | null) => {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) { setError('Photo must be a PNG or JPG'); return; }
    if (file.size > MAX_PHOTO_BYTES) { setError('Photo must be under 2 MB'); return; }
    setError('');
    setPendingFile(file);
    setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
  };

  const clearPhoto = () => {
    setPendingFile(null);
    setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Upload to profile-photos/{userId}/{filename}. Must run AFTER signUp returns a
  // session — the bucket's RLS only lets an authenticated user write to their own
  // user_id folder, so there's no valid "temp" folder to upload to pre-auth.
  const uploadPhoto = async (userId: string, file: File): Promise<string> => {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('profile-photos')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) throw upErr;
    return supabase.storage.from('profile-photos').getPublicUrl(path).data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) { setError('Display name is required'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setError('');
    setLoading(true);

    const { data, error: signUpErr } = await supabase.auth.signUp({ email, password });
    if (signUpErr) { setError(signUpErr.message); setLoading(false); return; }

    if (!data.session) {
      // Email confirmation required — no session yet, so we can't upload the photo
      // (storage needs an authenticated user). They can add it later from Settings.
      setDone(true);
      setLoading(false);
      return;
    }

    // Upload the photo first so we have a URL to persist with the profile.
    let avatarUrl: string | null = null;
    if (pendingFile) {
      try {
        avatarUrl = await uploadPhoto(data.user!.id, pendingFile);
      } catch (err: any) {
        setError(`Photo upload failed: ${err?.message || 'unknown error'}. Try a different image or skip it.`);
        setLoading(false);
        return;
      }
    }

    const { error: profileErr } = await supabase.from('profiles').insert({
      id: data.user!.id,
      email,
      name: displayName.trim(),
      role: 'moderator',
      avatar_url: avatarUrl,
    });
    if (profileErr) { setError(profileErr.message); setLoading(false); return; }

    const { data: rpcResult } = await supabase.rpc('setup_invite_account', {
      p_token: token!,
      p_avatar_url: avatarUrl ?? undefined,
    });
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
              {/* Profile photo — optional */}
              <div className="flex items-center gap-4 pb-1">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files?.[0]); }}
                  className="relative flex items-center justify-center shrink-0 cursor-pointer rounded-full"
                  style={{
                    width: 64, height: 64, overflow: 'hidden',
                    background: '#2a1f00', color: '#fbbf24',
                    fontSize: 20, fontWeight: 600,
                    border: dragging ? '2px dashed #fbbf24' : '2px solid transparent',
                    transition: 'border-color 0.15s',
                  }}
                  title="Upload a profile photo"
                >
                  {previewUrl ? (
                    <img src={previewUrl} alt="Profile preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : displayName.trim() ? (
                    <span>{getInitials(displayName)}</span>
                  ) : (
                    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                      <circle cx="12" cy="13" r="3" />
                    </svg>
                  )}
                </div>
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="block text-sm text-[#60a5fa] hover:opacity-80"
                  >
                    {previewUrl ? 'Change photo' : 'Add a photo'}
                  </button>
                  {previewUrl ? (
                    <button type="button" onClick={clearPhoto} className="block text-xs text-muted-foreground hover:text-foreground mt-0.5">
                      Remove
                    </button>
                  ) : (
                    <span className="block text-xs text-muted-foreground mt-0.5">Optional · drag &amp; drop, PNG/JPG up to 2 MB</span>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    style={{ display: 'none' }}
                    onChange={(e) => { acceptFile(e.target.files?.[0]); e.target.value = ''; }}
                  />
                </div>
              </div>

              <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                style={inputStyle} required />
              <div>
                <input type="text" placeholder="Display name (required)" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                  style={inputStyle} required aria-required="true" />
                <p className="text-xs text-muted-foreground mt-1 ml-0.5">How mods and students will see you — required</p>
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
