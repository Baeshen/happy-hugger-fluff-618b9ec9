DROP POLICY IF EXISTS "Admins can view security audit log" ON public.security_audit_log;
CREATE POLICY "Admins can view security audit log"
  ON public.security_audit_log FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));