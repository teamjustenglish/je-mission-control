import React, { useState } from 'react';

const RUBRIC_DATA: Record<string, string[]> = {
  'Content': ['Unclear or disjointed', 'Somewhat clear', 'Clear, most aspects', 'Clear, coherent and thorough'],
  'Organization': ['Poorly organised', 'Some lapses in flow', 'Mostly well-organised', 'Well-structured, logical flow'],
  'Clarity': ['Difficult to understand', 'Mostly clear, some issues', 'Clear and generally understandable', 'Very clear and easily understandable'],
  'Vocab & grammar': ['Limited vocab, frequent errors', 'Adequate, some errors', 'Good range, mostly precise', 'Rich, varied and precise'],
  'Delivery': ['Monotone or disengaged', 'Somewhat engaging, lapses', 'Satisfactory, natural tone', 'Engaging, strong etiquette'],
  'Language use': ['Ineffective', 'Some effective use', 'Mostly effective', 'Effective for audience and context'],
};

const LEVEL_STYLES = [
  { bg: '#1a0a0a', badge: '#2a0a0a', text: '#f87171', label: '1 Poor' },
  { bg: '#1a1500', badge: '#2a2000', text: '#fbbf24', label: '2 Fair' },
  { bg: '#141a14', badge: '#1a3a1a', text: '#86efac', label: '3 Good' },
  { bg: '#0d1f0d', badge: '#14532d', text: '#4ade80', label: '4 Excellent' },
];

const ScoringRubric: React.FC = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
        style={{ background: '#161616', borderBottom: '1px solid #2a2a2a', padding: '8px 14px' }}
      >
        <span style={{ fontSize: 12, color: '#666' }}>📋 Scoring rubric</span>
        <span style={{ fontSize: 12, color: '#555' }}>{expanded ? '▲ Hide' : '▼ Show'}</span>
      </button>
      {expanded && (
        <div style={{ padding: '0 14px 14px', background: '#111' }}>
          <table className="w-full" style={{ borderCollapse: 'collapse', marginTop: 8 }}>
            <thead>
              <tr>
                <th style={{ width: 120, background: '#111', fontSize: 12, color: '#888', fontWeight: 500, textAlign: 'left', padding: '8px 6px' }}>Criteria</th>
                {LEVEL_STYLES.map((level, i) => (
                  <th key={i} style={{ background: level.bg, padding: '6px 8px', textAlign: 'center' }}>
                    <span style={{ display: 'inline-block', background: level.badge, color: level.text, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4 }}>
                      {level.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(RUBRIC_DATA).map(([criterion, descriptions]) => (
                <tr key={criterion} style={{ borderBottom: '1px solid #1a1a1a' }} className="hover:bg-[#1e1e1e]">
                  <td style={{ background: '#111', fontWeight: 500, color: '#e8e8e8', fontSize: 13, padding: '8px 6px' }}>{criterion}</td>
                  {descriptions.map((desc, i) => (
                    <td key={i} style={{ background: LEVEL_STYLES[i].bg, color: '#666', fontSize: 12, lineHeight: 1.5, padding: '8px 10px', textAlign: 'center' }}>
                      {desc}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ScoringRubric;
