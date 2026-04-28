ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_session_index_check;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_session_index_check
  CHECK (session_index >= 0 AND (session_index <= 23 OR session_index BETWEEN 1000 AND 9999));
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_student_id_session_index_key;