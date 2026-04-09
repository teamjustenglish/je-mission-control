import React, { useState } from 'react';

const RUBRIC_DATA: Record<string, string[]> = {
  'Task achievement & content': [
    'Fully answers the task. Ideas are clear, relevant, and well-developed.',
    'Answers the task well. Ideas are mostly clear and relevant.',
    'Partially answers the task. Some ideas unclear or not fully developed.',
    'Limited answer. Ideas are unclear, repetitive, or not well explained.',
    'Very limited response. Barely addresses the task.',
    'No meaningful response.',
  ],
  'Fluency & coherence': [
    'Speaks smoothly and naturally. Ideas well organised and easy to follow.',
    'Mostly smooth. Minor pauses. Ideas generally organised.',
    'Some hesitation and repetition. Organisation sometimes unclear.',
    'Frequent pauses. Ideas difficult to follow.',
    'Very hesitant. Hard to understand flow of ideas.',
    'Cannot produce connected speech.',
  ],
  'Lexical resources': [
    'Uses a wide range of vocabulary accurately and naturally.',
    'Good range of vocabulary. Minor mistakes.',
    'Adequate vocabulary. Some repetition and noticeable errors.',
    'Limited vocabulary. Frequent repetition and incorrect word use.',
    'Very basic vocabulary. Many errors.',
    'Extremely limited or no vocabulary.',
  ],
  'Grammatical accuracy': [
    'Uses a variety of structures accurately. Very few or no errors.',
    'Good control of grammar. Some minor errors. Self-corrects sometimes.',
    'Mix of correct and incorrect grammar. Errors sometimes affect clarity.',
    'Frequent grammatical errors. Meaning often unclear.',
    'Very frequent errors. Hard to understand.',
    'No correct grammatical structures.',
  ],
};

const LEVEL_STYLES = [
  { bg: '#0d1f0d', badge: '#14532d', text: '#4ade80', label: '5 Excellent' },
  { bg: '#141a14', badge: '#1a3a1a', text: '#86efac', label: '4 Good' },
  { bg: '#1a1800', badge: '#2a2800', text: '#fde68a', label: '3 Partial' },
  { bg: '#1a1500', badge: '#2a2000', text: '#fbbf24', label: '2 Limited' },
  { bg: '#1a0e0a', badge: '#2a1500', text: '#fb923c', label: '1 Very limited' },
  { bg: '#1a0a0a', badge: '#2a0a0a', text: '#f87171', label: '0 No response' },
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
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: '#555', fontStyle: 'italic' }}>← click to expand / collapse</span>
          <span style={{ fontSize: 12, color: '#555' }}>{expanded ? '▲ Hide' : '▼ Show'}</span>
        </span>
      </button>
      {expanded && (
        <div style={{ padding: '0 14px 14px', background: '#111' }}>
          <table className="w-full" style={{ borderCollapse: 'collapse', marginTop: 8 }}>
            <thead>
              <tr>
                <th style={{ width: 140, background: '#111', fontSize: 12, color: '#888', fontWeight: 500, textAlign: 'left', padding: '8px 6px' }}>Criteria</th>
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
