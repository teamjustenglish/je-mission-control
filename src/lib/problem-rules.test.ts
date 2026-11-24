import { describe, it, expect } from 'vitest'
import { problemNoteInput, cleanPage, firstLine, PROBLEM_LIMITS } from '../../supabase/functions/_shared/problem-rules'

const who = { id: '11111111-1111-1111-1111-111111111111', name: 'Candle', role: 'moderator' }

describe('problemNoteInput', () => {
  it('builds an open report note; who comes from the login, not the form', () => {
    const n = problemNoteInput({
      detail: '  Attendance won\'t save\n\nIt spins forever  ', severity: 'blocking', page: '/mod?token=abc#x',
      about: 'Batch: Nov 17', browser: 'Safari', client_time: '2026-11-25T20:01:00.000Z',
      errors: ['a', '', 'b'], reported_by: 'someone-else', reporter_name: 'Fake',
    }, who)!
    expect(n.title).toBe("Attendance won't save")
    expect(n.detail).toBe("Attendance won't save\n\nIt spins forever")
    expect(n).toMatchObject({ status: 'open', source: 'report', severity: 'blocking', page: '/mod', about: 'Batch: Nov 17' })
    expect(n.reported_by).toBe(who.id)
    expect(n.reporter_name).toBe('Candle')
    expect(n.errors).toEqual(['a', 'b'])
  })

  it('refuses empty or too-long reports', () => {
    expect(problemNoteInput({ detail: '   ' }, who)).toBeNull()
    expect(problemNoteInput({}, who)).toBeNull()
    expect(problemNoteInput({ detail: 'x'.repeat(PROBLEM_LIMITS.detail + 1) }, who)).toBeNull()
  })

  it('defaults unknown severity to annoying and drops bad extras', () => {
    const n = problemNoteInput({ detail: 'x', severity: 'urgent!!', page: 'https://evil', client_time: 'yesterday', errors: 'nope' }, who)!
    expect(n.severity).toBe('annoying')
    expect(n.page).toBeNull()
    expect(n.client_time).toBeNull()
    expect(n.errors).toBeNull()
  })

  it('keeps only the last 5 errors, each cut to 300 characters', () => {
    const n = problemNoteInput({ detail: 'x', errors: Array.from({ length: 8 }, (_, i) => `e${i}` + 'y'.repeat(400)) }, who)!
    expect(n.errors).toHaveLength(5)
    expect(n.errors![0].startsWith('e3')).toBe(true)
    expect(n.errors![0].length).toBe(300)
  })
})

describe('helpers', () => {
  it('cleanPage keeps only the path', () => {
    expect(cleanPage('/admin/batch/3?x=1')).toBe('/admin/batch/3')
    expect(cleanPage('admin')).toBeNull()
  })
  it('firstLine shortens long titles', () => {
    expect(firstLine('y'.repeat(200)).length).toBe(PROBLEM_LIMITS.title)
  })
})
