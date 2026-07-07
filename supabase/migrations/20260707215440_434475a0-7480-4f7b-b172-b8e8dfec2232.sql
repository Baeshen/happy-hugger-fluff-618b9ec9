
ALTER TABLE public.patient_ratings
  ADD COLUMN IF NOT EXISTS staff_reply text,
  ADD COLUMN IF NOT EXISTS staff_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS staff_reply_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Allow staff to update replies
DROP POLICY IF EXISTS "Staff can reply to ratings" ON public.patient_ratings;
CREATE POLICY "Staff can reply to ratings"
  ON public.patient_ratings
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'reception')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'reception')
  );

CREATE OR REPLACE FUNCTION public.reply_to_rating(_id uuid, _reply text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _clean text := NULLIF(substring(coalesce(trim(_reply),'') for 1000),'');
BEGIN
  PERFORM public._assert_staff();
  UPDATE public.patient_ratings
     SET staff_reply = _clean,
         staff_reply_at = CASE WHEN _clean IS NULL THEN NULL ELSE now() END,
         staff_reply_by = CASE WHEN _clean IS NULL THEN NULL ELSE auth.uid() END
   WHERE id = _id;
END $$;

GRANT EXECUTE ON FUNCTION public.reply_to_rating(uuid, text) TO authenticated;
