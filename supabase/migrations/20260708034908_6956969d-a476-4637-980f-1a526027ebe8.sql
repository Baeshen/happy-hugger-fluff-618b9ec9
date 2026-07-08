
ALTER TABLE public.patient_stories
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending_review'
  CHECK (status IN ('pending_review','published','rejected'));

-- Backfill any pre-existing published rows so they remain visible.
UPDATE public.patient_stories
  SET status = 'published'
  WHERE published_at IS NOT NULL AND status = 'pending_review';

-- Tighten the public read policy to require the published status too.
DROP POLICY IF EXISTS "Public read published stories" ON public.patient_stories;
CREATE POLICY "Public read published stories" ON public.patient_stories
  FOR SELECT
  USING (status = 'published' AND published_at IS NOT NULL AND published_at <= now());
