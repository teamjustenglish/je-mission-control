-- 1. Rename admin profile from "Admin" to "Dave" so mod-facing attribution
--    shows the actual name rather than the generic role label.
UPDATE public.profiles
  SET name = 'Dave'
  WHERE role = 'admin';

-- 2. Allow all authenticated users to read profiles so that the
--    profiles!created_by(name) join in the announcements fetch succeeds
--    for mods (previously only own-profile + admin-reads-all policies
--    existed, causing the join to return null for mod sessions).
CREATE POLICY "Authenticated users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);
