
-- 1) Tighten public INSERT policy on patient_ratings
DROP POLICY IF EXISTS "Anyone can submit rating" ON public.patient_ratings;

CREATE POLICY "Anyone can submit rating"
  ON public.patient_ratings FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    rating BETWEEN 1 AND 5
    AND staff_reply IS NULL
    AND staff_reply_by IS NULL
    AND staff_reply_at IS NULL
    AND source = 'public'
  );

-- 2) Pin search_path on set_updated_at
ALTER FUNCTION public.set_updated_at() SET search_path = public;
