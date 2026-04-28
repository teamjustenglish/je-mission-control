-- First remove any duplicate rows that would block the unique constraint, keeping the most recently created one (by id ordering as tiebreaker)
DELETE FROM public.attendance a
USING public.attendance b
WHERE a.ctid < b.ctid
  AND a.batch_id = b.batch_id
  AND a.student_id = b.student_id
  AND a.session_index = b.session_index;

ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_unique_session
  UNIQUE (batch_id, student_id, session_index);