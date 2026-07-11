-- 1) Make super_admin implicitly satisfy every role check.
-- Any policy or server function that calls has_role(uid, 'X') will now
-- also return true for super_admin, without editing every policy.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = _role OR role = 'super_admin'::app_role)
  );
$$;

-- 2) Defense-in-depth: make critical policies list super_admin explicitly
--    (redundant with #1 but survives if has_role is ever reverted).
DROP POLICY IF EXISTS "Admins delete corporate requests" ON public.corporate_requests;
CREATE POLICY "Admins delete corporate requests"
  ON public.corporate_requests FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Admins read corporate requests" ON public.corporate_requests;
CREATE POLICY "Admins read corporate requests"
  ON public.corporate_requests FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Admins update corporate requests" ON public.corporate_requests;
CREATE POLICY "Admins update corporate requests"
  ON public.corporate_requests FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Admins delete second opinion" ON public.second_opinion_requests;
CREATE POLICY "Admins delete second opinion"
  ON public.second_opinion_requests FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Admins read second opinion" ON public.second_opinion_requests;
CREATE POLICY "Admins read second opinion"
  ON public.second_opinion_requests FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Admins update second opinion" ON public.second_opinion_requests;
CREATE POLICY "Admins update second opinion"
  ON public.second_opinion_requests FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Admins manage stories" ON public.patient_stories;
CREATE POLICY "Admins manage stories"
  ON public.patient_stories FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Admins read all stories" ON public.patient_stories;
CREATE POLICY "Admins read all stories"
  ON public.patient_stories FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));