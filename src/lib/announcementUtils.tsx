import React from 'react';

export interface AnnCtx {
  firstName: string;
  batchName: string;
}

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/g;

export function substitutePlaceholders(body: string, ctx: AnnCtx): string {
  return body
    .replace(/\{name\}/g, ctx.firstName)
    .replace(/\{first_name\}/g, ctx.firstName)
    .replace(/\{batch\}/g, ctx.batchName);
}

export function renderAnnouncementContent(body: string, ctx: AnnCtx): React.ReactNode {
  const text = substitutePlaceholders(body, ctx);
  const parts: React.ReactNode[] = [];
  let last = 0;
  const re = new RegExp(URL_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const raw = m[0];
    const href = raw.startsWith('www.') ? `https://${raw}` : raw;
    parts.push(
      <a
        key={m.index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        style={{ color: '#60a5fa', textDecoration: 'underline', wordBreak: 'break-all' }}
      >
        {raw}
      </a>
    );
    last = m.index + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
