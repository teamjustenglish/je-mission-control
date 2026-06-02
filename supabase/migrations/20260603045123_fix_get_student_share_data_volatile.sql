-- get_student_share_data was declared STABLE but contains an UPDATE
-- (sets last_viewed_at). PostgREST runs STABLE functions in a read-only
-- transaction, causing the UPDATE to fail and every share link to show
-- "not found" to the student/parent. Marking VOLATILE is correct because
-- the function modifies the database.
ALTER FUNCTION public.get_student_share_data(text) VOLATILE;
