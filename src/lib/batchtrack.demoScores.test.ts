import { describe, it, expect } from 'vitest';
import { dedupeDemoScores, demoScoreKey, type DemoScoreRow } from './batchtrack';

const row = (id: string, criterion: string, score: number, student = 'stu-1', day = 'dd-1'): DemoScoreRow =>
  ({ id, demo_day_id: day, student_id: student, criterion, score });

describe('dedupeDemoScores', () => {
  it('leaves clean data untouched', () => {
    const rows = [row('a', 'Fluency & coherence', 3), row('b', 'Lexical resources', 4)];
    const { rows: out, duplicates } = dedupeDemoScores(rows);
    expect(duplicates).toBe(0);
    expect(out).toHaveLength(2);
  });

  it('collapses duplicate rows for the same cell', () => {
    const rows = [row('a', 'Fluency & coherence', 0), row('b', 'Fluency & coherence', 3)];
    const { rows: out, duplicates } = dedupeDemoScores(rows);
    expect(duplicates).toBe(1);
    expect(out).toHaveLength(1);
    // The real mark wins over the leftover score-0 row.
    expect(out[0].score).toBe(3);
  });

  it('resolves duplicates identically regardless of the order Postgres returns them', () => {
    const rows = [row('a', 'Lexical resources', 0), row('b', 'Lexical resources', 2.5)];
    const forward = dedupeDemoScores(rows);
    const reversed = dedupeDemoScores([...rows].reverse());
    // This is the actual bug: an unordered read used to flip the displayed mark
    // between loads. The resolved row must not depend on row order.
    expect(forward.rows).toEqual(reversed.rows);
    expect(forward.rows[0].score).toBe(2.5);
  });

  it('breaks score ties deterministically by id', () => {
    const rows = [row('zzz', 'Grammatical accuracy', 3), row('aaa', 'Grammatical accuracy', 3)];
    const { rows: out } = dedupeDemoScores(rows);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('aaa');
    expect(dedupeDemoScores([...rows].reverse()).rows[0].id).toBe('aaa');
  });

  it('keeps cells for different students, days and criteria apart', () => {
    const rows = [
      row('a', 'Fluency & coherence', 3, 'stu-1', 'dd-1'),
      row('b', 'Fluency & coherence', 4, 'stu-2', 'dd-1'),
      row('c', 'Fluency & coherence', 2, 'stu-1', 'dd-2'),
      row('d', 'Lexical resources', 1, 'stu-1', 'dd-1'),
    ];
    const { rows: out, duplicates } = dedupeDemoScores(rows);
    expect(duplicates).toBe(0);
    expect(out).toHaveLength(4);
    expect(new Set(out.map(demoScoreKey)).size).toBe(4);
  });

  it('returns a stable order across loads', () => {
    const rows = [
      row('c', 'Lexical resources', 2),
      row('a', 'Fluency & coherence', 3),
      row('b', 'Grammatical accuracy', 1),
    ];
    const first = dedupeDemoScores(rows).rows.map(r => r.id);
    const second = dedupeDemoScores([...rows].reverse()).rows.map(r => r.id);
    expect(first).toEqual(second);
  });

  it('handles an empty result', () => {
    expect(dedupeDemoScores([])).toEqual({ rows: [], duplicates: 0 });
  });
});
