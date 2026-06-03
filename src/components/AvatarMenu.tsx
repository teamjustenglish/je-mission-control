import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Settings, HelpCircle, LogOut, X, ArrowUpRight, MessageCircle, Phone } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface AvatarMenuProps {
  role: 'admin' | 'moderator';
  batchLabel?: string;
}

const getInitials = (name: string) =>
  name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?';

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
  const { profile, signOut, refreshProfile } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (profile?.name) setDisplayName(profile.name);
  }, [profile?.name]);

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

  const handleSave = async () => {
    if (!profile || saving || !displayName.trim()) return;
    setSaving(true);
    try {
      await supabase.from('profiles').update({ name: displayName.trim() }).eq('id', profile.id);
      await refreshProfile();
    } finally {
      setSaving(false);
      setSettingsOpen(false);
    }
  };

  const openSettings = () => { setDisplayName(profile?.name || ''); setDropdownOpen(false); setSettingsOpen(true); };
  const openHelp = () => { setDropdownOpen(false); setHelpOpen(true); };
  const handleLogout = async () => { setDropdownOpen(false); await signOut(); };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setDropdownOpen(o => !o)}
        style={{
          width: 32, height: 32, borderRadius: '50%',
          background: '#2a1f00', color: '#fbbf24',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 600,
          border: dropdownOpen ? '2px solid rgba(251,191,36,0.4)' : '2px solid transparent',
          cursor: 'pointer', transition: 'border-color 0.15s',
        }}
      >
        {getInitials(profile?.name || '?')}
      </button>

      {dropdownOpen && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 240, background: '#1a1a1a',
          border: '0.5px solid rgba(255,255,255,0.08)',
          borderRadius: 10, padding: 8,
          zIndex: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          <div style={{ padding: '8px 10px 12px' }}>
            <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>
              {profile?.name || '—'}
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{subLabel}</div>
          </div>
          <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.08)', marginBottom: 4 }} />

          <button
            onClick={openSettings}
            style={itemStyle}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <Settings size={14} style={{ color: '#888' }} />
            <span>Settings</span>
          </button>

          <button
            onClick={openHelp}
            style={itemStyle}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <HelpCircle size={14} style={{ color: '#888' }} />
            <span>Help & feedback</span>
          </button>

          <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />

          <button
            onClick={handleLogout}
            style={{ ...itemStyle, color: '#fca5a5' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
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
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#1a1a1a', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 14, width: 380, maxWidth: '90vw' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Settings</span>
              <button onClick={() => setSettingsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', display: 'flex', alignItems: 'center' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: 20 }}>
              {/* TODO: profile photo upload (Supabase storage bucket `profile-photos` + profiles.avatar_url) */}
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
                onClick={() => { setDisplayName(profile?.name || ''); setSettingsOpen(false); }}
                style={{ background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.1)', color: '#ccc', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !displayName.trim()}
                style={{ background: '#fbbf24', border: 'none', color: '#111', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: saving || !displayName.trim() ? 'not-allowed' : 'pointer', opacity: saving || !displayName.trim() ? 0.6 : 1 }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
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
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#1a1a1a', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 14, width: 380, maxWidth: '90vw' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Help & feedback</span>
              <button onClick={() => setHelpOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', display: 'flex', alignItems: 'center' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ fontSize: 13, color: '#d1d1d1', marginBottom: 16, lineHeight: 1.55 }}>
                Need a hand with MC? Reach Dave directly — account issues, feature questions, anything.
              </p>
              <a
                href="https://discord.com/users/945392420386918473"
                target="_blank"
                rel="noopener noreferrer"
                style={contactCardStyle}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#2a2a2a'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#232323'; }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(88,101,242,0.15)', color: '#a5b4fc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MessageCircle size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>Discord</div>
                  <div style={{ fontSize: 11, color: '#888' }}>Message Dave</div>
                </div>
                <ArrowUpRight size={14} style={{ color: '#888', flexShrink: 0 }} />
              </a>
              <a
                href="https://wa.me/94777871102"
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...contactCardStyle, marginTop: 10 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#2a2a2a'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#232323'; }}
              >
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
