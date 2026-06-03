import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Settings, HelpCircle, LogOut, X, ArrowUpRight, MessageCircle, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface AvatarMenuProps {
  role: 'admin' | 'moderator';
  batchLabel?: string;
}

const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB

const getInitials = (name: string) =>
  name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?';

/** Amber-tinted initials circle. Shows photo if avatarUrl is set. */
const AvatarCircle: React.FC<{ name: string; avatarUrl?: string | null; size: number; uploading?: boolean }> = ({
  name, avatarUrl, size, uploading,
}) => (
  <div style={{
    width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size <= 32 ? 12 : 16, fontWeight: 600,
    background: '#2a1f00', color: '#fbbf24', position: 'relative',
  }}>
    {avatarUrl && !uploading ? (
      <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    ) : (
      <span style={uploading ? { opacity: 0.3 } : undefined}>{getInitials(name)}</span>
    )}
    {uploading && (
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#fbbf24" strokeWidth="2.5" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round">
            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
          </path>
        </svg>
      </span>
    )}
  </div>
);

const itemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  width: '100%', padding: '7px 10px',
  background: 'transparent', border: 'none', cursor: 'pointer',
  borderRadius: 6, color: '#e8e8e8', fontSize: 13, textAlign: 'left',
};

const contactCardStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '12px 14px', background: '#232323', borderRadius: 10,
  textDecoration: 'none', cursor: 'pointer',
};

const AvatarMenu: React.FC<AvatarMenuProps> = ({ role, batchLabel }) => {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile?.name) setDisplayName(profile.name);
  }, [profile?.name]);

  useEffect(() => {
    if (!settingsOpen) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPendingFile(null);
    }
  }, [settingsOpen]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const subLabel =
    role === 'admin' ? 'Admin' : batchLabel ? `Moderator · ${batchLabel}` : 'Moderator';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error('Photo must be under 2 MB');
      e.target.value = '';
      return;
    }
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    e.target.value = '';
  };

  const uploadPhoto = async (file: File): Promise<string> => {
    if (!user) throw new Error('Not authenticated');
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('profile-photos')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('profile-photos').getPublicUrl(path);
    return urlData.publicUrl;
  };

  const handleSave = async () => {
    if (!profile || saving || uploading) return;
    setSaving(true);
    try {
      const updates: Record<string, string> = { name: displayName.trim() };
      if (pendingFile) {
        setUploading(true);
        try {
          updates.avatar_url = await uploadPhoto(pendingFile);
        } catch {
          toast.error('Photo upload failed — please try again');
          return;
        } finally {
          setUploading(false);
        }
      }
      await supabase.from('profiles').update(updates).eq('id', profile.id);
      await refreshProfile();
      setSettingsOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const openSettings = () => {
    setDisplayName(profile?.name || '');
    setPreviewUrl(null);
    setPendingFile(null);
    setDropdownOpen(false);
    setSettingsOpen(true);
  };

  const displayAvatarUrl = previewUrl ?? profile?.avatar_url;

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Avatar button */}
      <button
        onClick={() => setDropdownOpen(o => !o)}
        style={{
          padding: 0, border: dropdownOpen ? '2px solid rgba(251,191,36,0.4)' : '2px solid transparent',
          borderRadius: '50%', cursor: 'pointer', background: 'none', transition: 'border-color 0.15s',
        }}
      >
        <AvatarCircle name={profile?.name || '?'} avatarUrl={profile?.avatar_url} size={32} />
      </button>

      {/* Dropdown */}
      {dropdownOpen && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 240, background: '#1a1a1a',
          border: '0.5px solid rgba(255,255,255,0.08)',
          borderRadius: 10, padding: 8,
          zIndex: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          <div style={{ padding: '8px 10px 12px' }}>
            <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{profile?.name || '—'}</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{subLabel}</div>
          </div>
          <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.08)', marginBottom: 4 }} />

          <button onClick={openSettings} style={itemStyle}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
            <Settings size={14} style={{ color: '#888' }} />
            <span>Settings</span>
          </button>

          <button onClick={() => { setDropdownOpen(false); setHelpOpen(true); }} style={itemStyle}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
            <HelpCircle size={14} style={{ color: '#888' }} />
            <span>Help & feedback</span>
          </button>

          <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />

          <button onClick={async () => { setDropdownOpen(false); await signOut(); }}
            style={{ ...itemStyle, color: '#fca5a5' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
            <LogOut size={14} />
            <span>Log out</span>
          </button>
        </div>
      )}

      {/* Settings modal */}
      {settingsOpen && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setSettingsOpen(false)}
        >
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#1a1a1a', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 14, width: 380, maxWidth: '90vw' }}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Settings</span>
              <button onClick={() => setSettingsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', display: 'flex' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: 20 }}>
              {/* Photo row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <AvatarCircle name={profile?.name || '?'} avatarUrl={displayAvatarUrl} size={56} uploading={uploading} />
                <div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    style={{ fontSize: 13, color: '#60a5fa', background: 'none', border: 'none', cursor: uploading ? 'default' : 'pointer', padding: 0, opacity: uploading ? 0.5 : 1, display: 'block', marginBottom: 4 }}
                  >
                    {uploading ? 'Uploading…' : 'Change photo'}
                  </button>
                  <span style={{ fontSize: 11, color: '#666' }}>PNG or JPG, up to 2 MB</span>
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={handleFileChange} />
                </div>
              </div>

              {/* Display name */}
              <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>Display name</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                style={{
                  width: '100%', background: '#242424', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#fff', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '0.5px solid rgba(255,255,255,0.08)' }}>
              <button
                onClick={() => setSettingsOpen(false)}
                style={{ background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.1)', color: '#ccc', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}
              >Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || uploading || !displayName.trim()}
                style={{ background: '#fbbf24', border: 'none', color: '#111', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: saving || uploading || !displayName.trim() ? 'not-allowed' : 'pointer', opacity: saving || uploading || !displayName.trim() ? 0.6 : 1 }}
              >{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Help & feedback modal */}
      {helpOpen && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setHelpOpen(false)}
        >
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#1a1a1a', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 14, width: 380, maxWidth: '90vw' }}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Help & feedback</span>
              <button onClick={() => setHelpOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', display: 'flex' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: 20 }}>
              <p style={{ fontSize: 13, color: '#d1d1d1', marginBottom: 16, lineHeight: 1.55 }}>
                Need a hand with MC? Reach Dave directly — account issues, feature questions, anything.
              </p>
              <a href="https://discord.com/users/945392420386918473" target="_blank" rel="noopener noreferrer"
                style={contactCardStyle}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#2a2a2a'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#232323'; }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(88,101,242,0.15)', color: '#a5b4fc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MessageCircle size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>Discord</div>
                  <div style={{ fontSize: 11, color: '#888' }}>Message Dave</div>
                </div>
                <ArrowUpRight size={14} style={{ color: '#888', flexShrink: 0 }} />
              </a>
              <a href="https://wa.me/94777871102" target="_blank" rel="noopener noreferrer"
                style={{ ...contactCardStyle, marginTop: 10 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#2a2a2a'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#232323'; }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(37,211,102,0.12)', color: '#86efac', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Phone size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>WhatsApp</div>
                  <div style={{ fontSize: 11, color: '#888' }}>+94 77 787 1102</div>
                </div>
                <ArrowUpRight size={14} style={{ color: '#888', flexShrink: 0 }} />
              </a>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AvatarMenu;
