-- Alert rules for transition dashboards
CREATE TABLE public.transition_alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text,
  scope text NOT NULL CHECK (scope IN ('branch','actor','any')),
  status text NOT NULL CHECK (status IN ('active','inactive','archived','deceased','any')),
  threshold integer NOT NULL CHECK (threshold >= 1),
  enabled boolean NOT NULL DEFAULT true,
  is_shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transition_alert_rules TO authenticated;
GRANT ALL ON public.transition_alert_rules TO service_role;

ALTER TABLE public.transition_alert_rules ENABLE ROW LEVEL SECURITY;

-- Owners see their own rules
CREATE POLICY "own_rules_select" ON public.transition_alert_rules
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Staff see shared rules
CREATE POLICY "shared_rules_select" ON public.transition_alert_rules
  FOR SELECT TO authenticated
  USING (
    is_shared = true AND (
      public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'reception')
      OR public.has_role(auth.uid(),'doctor')
    )
  );

-- Authenticated staff can create rules they own
CREATE POLICY "own_rules_insert" ON public.transition_alert_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'reception')
      OR public.has_role(auth.uid(),'doctor')
    )
  );

-- Update: owner or super_admin
CREATE POLICY "own_rules_update" ON public.transition_alert_rules
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

-- Delete: owner or super_admin
CREATE POLICY "own_rules_delete" ON public.transition_alert_rules
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

-- updated_at trigger
CREATE TRIGGER trg_transition_alert_rules_updated_at
  BEFORE UPDATE ON public.transition_alert_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_transition_alert_rules_user ON public.transition_alert_rules(user_id);
CREATE INDEX idx_transition_alert_rules_shared ON public.transition_alert_rules(is_shared) WHERE is_shared = true;