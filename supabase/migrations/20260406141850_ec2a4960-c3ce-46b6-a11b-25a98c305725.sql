-- Allow admin to delete profiles (needed for cascade delete of moderators)
CREATE POLICY "Admins can delete profiles"
ON public.profiles
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admin to delete activity_log (needed for cascade delete)
CREATE POLICY "Admins can delete activity_log"
ON public.activity_log
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
