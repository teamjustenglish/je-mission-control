-- Add avatar_url to profiles (nullable, no default — existing rows get NULL).
--
-- NOTE: an earlier migration (20260604120000_add_avatar_url_and_profile_photos.sql)
-- attempted to add this column AND create the profile-photos storage bucket + RLS
-- policies in a single transaction. The CREATE POLICY statements on storage.objects
-- failed under Lovable, rolling back the whole migration — so the column never landed
-- (verified live: profiles has no avatar_url, storage has no profile-photos bucket).
--
-- This migration does ONLY the column add, kept isolated and idempotent so it can't be
-- taken down by storage-policy failures. The bucket + policies are handled separately as
-- a Lovable storage step (see the PR description) rather than via SQL migration.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
