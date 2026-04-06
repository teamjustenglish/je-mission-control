-- Allow anyone to update moderator_codes.used during activation
CREATE POLICY "Anyone can update codes for activation"
ON public.moderator_codes
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);