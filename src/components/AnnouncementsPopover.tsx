import React, { useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface AnnouncementItem {
  id: string;
  title: string;
  body: string | null;
  has_poll: boolean;
  created_at: string;
  creator_name: string;
}

interface AnnPollOption {
  id: string;
  announcement_id: string;
  option_text: string;
  position: number;
}

type AnnStatus = 'unread' | 'gotit' | 'voted';

function getStatus(
  ann: AnnouncementItem,
  readAnnIds: Set<string>,
  dismissedAnnIds: Set<string>,
  myAnnVotes: Record<string, string>,
): AnnStatus {
  if (ann.has_poll && myAnnVotes[ann.id]) return 'voted';
  if (readAnnIds.has(ann.id) || dismissedAnnIds.has(ann.id)) return 'gotit';
  return 'unread';
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface AnnouncementsPopoverProps {
  allAnnouncements: AnnouncementItem[];
  readAnnIds: Set<string>;
  dismissedAnnIds: Set<string>;
  myAnnVotes: Record<string, string>;
  annPollOptions: AnnPollOption[];
  onGotIt: (annId: string) => void;
  onVote: (annId: string, optId: string) => void;
}

export default function AnnouncementsPopover({
  allAnnouncements,
  readAnnIds,
  dismissedAnnIds,
  myAnnVotes,
  annPollOptions,
  onGotIt,
  onVote,
}: AnnouncementsPopoverProps) {
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const hasNew = allAnnouncements.some(
    a => getStatus(a, readAnnIds, dismissedAnnIds, myAnnVotes) === 'unread',
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Announcements"
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            borderRadius: 6,
            color: hasNew ? '#f0a020' : 'hsl(var(--muted-foreground))',
            flexShrink: 0,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'hsl(var(--secondary))'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        >
          <Megaphone size={20} strokeWidth={1.75} />
          {hasNew && (
            <span style={{
              position: 'absolute',
              top: 5,
              right: 5,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#f0a020',
              border: '1.5px solid hsl(var(--nav-bg))',
              pointerEvents: 'none',
            }} />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        style={{
          width: 340,
          maxHeight: 480,
          padding: 0,
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 10,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: '1px solid hsl(var(--border))',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--foreground))' }}>Announcements</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 24, height: 24, background: 'transparent', border: 'none',
              cursor: 'pointer', color: 'hsl(var(--muted-foreground))', borderRadius: 4,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'hsl(var(--foreground))'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'hsl(var(--muted-foreground))'; }}
          >
            <X size={14} />
          </button>
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {allAnnouncements.length === 0 ? (
            <p style={{ padding: '24px 14px', fontSize: 13, color: 'hsl(var(--muted-foreground))', textAlign: 'center' }}>
              No announcements
            </p>
          ) : allAnnouncements.map(ann => {
            const status = getStatus(ann, readAnnIds, dismissedAnnIds, myAnnVotes);
            const isExpanded = expandedId === ann.id;
            const opts = annPollOptions
              .filter(o => o.announcement_id === ann.id)
              .sort((a, b) => a.position - b.position);
            const myVote = myAnnVotes[ann.id];

            return (
              <div key={ann.id} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                {/* Collapsed row */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : ann.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'hsl(var(--secondary))'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'hsl(var(--foreground))', flex: 1, lineHeight: 1.35 }}>
                      {ann.title}
                    </span>
                    {status === 'unread' && (
                      <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 9999, background: 'hsl(var(--score-amber) / 0.15)', color: 'hsl(var(--score-amber))', border: '1px solid hsl(var(--score-amber) / 0.3)', lineHeight: 1.6 }}>
                        Unread
                      </span>
                    )}
                    {status === 'gotit' && (
                      <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 9999, background: 'hsl(var(--score-green) / 0.12)', color: 'hsl(var(--score-green))', border: '1px solid hsl(var(--score-green) / 0.3)', lineHeight: 1.6 }}>
                        Got it
                      </span>
                    )}
                    {status === 'voted' && (
                      <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 9999, background: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))', border: '1px solid hsl(var(--border))', lineHeight: 1.6 }}>
                        Poll · voted
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: !isExpanded && ann.body ? 3 : 0 }}>
                    {fmtDate(ann.created_at)}
                  </div>
                  {!isExpanded && ann.body && (
                    <p style={{
                      fontSize: 12, color: 'hsl(var(--muted-foreground))', margin: 0, lineHeight: 1.4,
                      overflow: 'hidden', display: '-webkit-box',
                      WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                      {ann.body}
                    </p>
                  )}
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ padding: '4px 14px 12px', borderTop: '1px solid hsl(var(--border) / 0.5)' }}>
                    {ann.body && (
                      <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', lineHeight: 1.5, marginBottom: opts.length ? 10 : 8, marginTop: 6 }}>
                        {ann.body}
                      </p>
                    )}
                    {ann.has_poll && opts.length > 0 && (
                      <div style={{ marginBottom: status === 'unread' ? 10 : 0 }}>
                        {opts.map(opt => {
                          const voted = myVote === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={e => { e.stopPropagation(); onVote(ann.id, opt.id); }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                                background: voted ? 'hsl(var(--score-green) / 0.08)' : 'hsl(var(--secondary))',
                                border: voted ? '1px solid hsl(var(--score-green) / 0.4)' : '1px solid hsl(var(--border))',
                                borderRadius: 6, padding: '7px 10px', marginBottom: 5,
                                cursor: 'pointer', textAlign: 'left',
                              }}
                            >
                              <span style={{
                                width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                                border: voted ? '3px solid hsl(var(--score-green))' : '2px solid hsl(var(--muted-foreground))',
                                background: voted ? 'hsl(var(--score-green))' : 'transparent',
                              }} />
                              <span style={{ fontSize: 12, color: 'hsl(var(--foreground))', flex: 1 }}>{opt.option_text}</span>
                              {voted && <span style={{ fontSize: 11, color: 'hsl(var(--score-green))' }}>✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {status === 'unread' && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); onGotIt(ann.id); }}
                          style={{
                            fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 6,
                            background: 'hsl(var(--foreground))', color: 'hsl(var(--primary-foreground))',
                            border: 'none', cursor: 'pointer',
                          }}
                        >
                          ✓ Got it
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
