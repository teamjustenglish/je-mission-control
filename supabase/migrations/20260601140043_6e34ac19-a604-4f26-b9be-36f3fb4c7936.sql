
-- Announcements
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  target_type TEXT NOT NULL DEFAULT 'all_mods',
  has_poll BOOLEAN NOT NULL DEFAULT FALSE,
  archived BOOLEAN NOT NULL DEFAULT FALSE
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read active announcements"
  ON public.announcements FOR SELECT TO authenticated
  USING (archived = false OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert announcements"
  ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND created_by = auth.uid());

CREATE POLICY "Admins can update announcements"
  ON public.announcements FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete announcements"
  ON public.announcements FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Poll options
CREATE TABLE public.announcement_poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcement_poll_options TO authenticated;
GRANT ALL ON public.announcement_poll_options TO service_role;

ALTER TABLE public.announcement_poll_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read poll options"
  ON public.announcement_poll_options FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.announcements a
      WHERE a.id = announcement_poll_options.announcement_id
        AND (a.archived = false OR public.has_role(auth.uid(), 'admin'::app_role))
    )
  );

CREATE POLICY "Admins can insert poll options"
  ON public.announcement_poll_options FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update poll options"
  ON public.announcement_poll_options FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete poll options"
  ON public.announcement_poll_options FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Read receipts
CREATE TABLE public.announcement_reads (
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcement_reads TO authenticated;
GRANT ALL ON public.announcement_reads TO service_role;

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own reads, admins see all"
  ON public.announcement_reads FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users insert own reads"
  ON public.announcement_reads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own reads"
  ON public.announcement_reads FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Poll votes
CREATE TABLE public.announcement_votes (
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  option_id UUID NOT NULL REFERENCES public.announcement_poll_options(id) ON DELETE CASCADE,
  voted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcement_votes TO authenticated;
GRANT ALL ON public.announcement_votes TO service_role;

ALTER TABLE public.announcement_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read votes"
  ON public.announcement_votes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users insert own vote"
  ON public.announcement_votes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own vote"
  ON public.announcement_votes FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own vote"
  ON public.announcement_votes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Indexes
CREATE INDEX idx_announcements_active ON public.announcements(archived, created_at DESC);
CREATE INDEX idx_announcement_reads_user ON public.announcement_reads(user_id);
CREATE INDEX idx_announcement_votes_user ON public.announcement_votes(user_id);
CREATE INDEX idx_poll_options_announcement ON public.announcement_poll_options(announcement_id, position);
