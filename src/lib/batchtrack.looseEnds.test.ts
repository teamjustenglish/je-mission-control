import { describe, it, expect } from 'vitest';
import { computeLooseEnds, type LooseEndsInput } from './batchtrack';

// Batch starts 2026-06-01. Session indices map to days-since-start via week*7 + [0,1,3,4].
// asOf is chosen per-test to control the "current week" and which sessions are in the past.
const START = '2026-06-01';

const base = (over: Partial<LooseEndsInput>): LooseEndsInput => ({
  startDate: START,
  students: [],
  attendance: [],
  demoDays: [],
  demoScores: [],
  demoFeedback: [],
  rescheduledSessions: [],
  weekStatuses: [],
  snoozes: [],
  ...over,
});

const att = (
  student_id: string,
  session_index: number,
  state: string,
  extra: { note?: string | null; category?: string | null } = {},
) => ({ student_id, session_index, state, absence_note: extra.note ?? null, absence_category: extra.category ?? null });

describe('computeLooseEnds', () => {
  it('returns zero when the batch has no start date or no active students', () => {
    expect(computeLooseEnds(base({ startDate: null })).total).toBe(0);
    expect(computeLooseEnds(base({ students: [{ id: 'x', status: 'dropped' }] })).total).toBe(0);
  });

  it('counts one untouched task per under-marked past session in the current week', () => {
    // asOf = start + 5 days → current week 1, all week-1 sessions in the past.
    const asOf = new Date('2026-06-06T09:00:00');
    const r = computeLooseEnds(base({
      students: [{ id: 'A', status: 'active' }, { id: 'B', status: 'active' }],
      attendance: [
        att('A', 0, 'c'), att('B', 0, 'c'), // full → not counted
        // idx1 unmarked entirely → counted
        att('A', 2, 'c'),                    // idx2 only A → counted
        att('A', 3, 'c'), att('B', 3, 'c'), // full → not counted
      ],
    }), asOf);
    expect(r.byType.untouched_session).toBe(2);
    expect(r.total).toBe(2);
  });

  it('counts one absence-reason task per session with an unexplained active absence', () => {
    const asOf = new Date('2026-06-06T09:00:00');
    const r = computeLooseEnds(base({
      students: [{ id: 'A', status: 'active' }, { id: 'B', status: 'active' }],
      attendance: [
        att('A', 0, 'c'), att('B', 0, 'x'),                          // B unexplained → counts
        att('A', 1, 'c'), att('B', 1, 'x', { category: 'Sick' }),    // explained → not counted
        att('A', 2, 'c'), att('B', 2, 'c'),
        att('A', 3, 'c'), att('B', 3, 'c'),
      ],
    }), asOf);
    expect(r.byType.absence_no_reason).toBe(1);
    expect(r.byType.untouched_session).toBe(0);
    expect(r.total).toBe(1);
  });

  it('flags a drop-out decision for a ≥6 session absence streak', () => {
    // asOf = start + 14 → current week 3; weeks 1-2 fully marked (all absences),
    // week-3 sessions not yet in the past, so the only loose end is the streak.
    const asOf = new Date('2026-06-15T09:00:00');
    const r = computeLooseEnds(base({
      students: [{ id: 'A', status: 'active' }],
      attendance: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => att('A', i, 'x', { category: 'Work' })),
    }), asOf);
    expect(r.byType.dropout_force_decide).toBe(1);
    expect(r.byType.absence_no_reason).toBe(0);
    expect(r.byType.untouched_session).toBe(0);
    expect(r.total).toBe(1);
  });

  it('honours an active snooze — a snoozed streak is not counted', () => {
    const asOf = new Date('2026-06-15T09:00:00');
    const r = computeLooseEnds(base({
      students: [{ id: 'A', status: 'active' }],
      attendance: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => att('A', i, 'x', { category: 'Work' })),
      snoozes: [{ student_id: 'A', snooze_type: 'dropout_force_decide', expires_at: '2026-06-30T00:00:00', created_at: '2026-06-14T00:00:00' }],
    }), asOf);
    expect(r.byType.dropout_force_decide).toBe(0);
    expect(r.total).toBe(0);
  });

  it('counts missing demo feedback and a needed make-up', () => {
    // asOf = start + 12 → current week 2 (a demo week); demo day (Fri, idx7) is in the past.
    const asOf = new Date('2026-06-13T09:00:00');
    const r = computeLooseEnds(base({
      students: [{ id: 'A', status: 'active' }, { id: 'B', status: 'active' }],
      attendance: [
        ...[0, 1, 2, 3, 4, 5, 6].flatMap((i) => [att('A', i, 'c'), att('B', i, 'c')]),
        att('A', 7, 'c'),                          // present at demo
        att('B', 7, 'x', { category: 'Sick' }),    // absent at demo (explained)
      ],
      demoDays: [{ id: 'dd1', day_number: 1, date: '2026-06-12' }],
      demoScores: [{ demo_day_id: 'dd1', student_id: 'A', makeup_date: null }], // A scored, B not
      demoFeedback: [],                             // A has no feedback yet
    }), asOf);
    expect(r.byType.demo_feedback_missing).toBe(1); // A: scored but no feedback
    expect(r.byType.demo_makeup_needed).toBe(1);    // B: absent, no make-up scheduled
    expect(r.byType.demo_scores_missing).toBe(0);
    expect(r.total).toBe(2);
  });

  it('excludes finalised past weeks and dropped students', () => {
    // asOf = start + 8 → current week 2; week 1 fully unmarked but FINALISED.
    const asOf = new Date('2026-06-09T09:00:00');
    const r = computeLooseEnds(base({
      students: [
        { id: 'A', status: 'active' },
        { id: 'B', status: 'active' },
        { id: 'C', status: 'dropped' }, // ignored everywhere
      ],
      attendance: [],                    // nothing marked
      weekStatuses: [{ week_number: 1, status: 'finalised' }],
    }), asOf);
    // Week 1's 4 untouched sessions are suppressed by finalisation; only week-2's single
    // past session (idx4, start+7) remains.
    expect(r.byType.untouched_session).toBe(1);
    expect(r.total).toBe(1);
  });
});
