
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE public.message_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_key TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('in_app','web_push','sms','whatsapp','email')),
  name TEXT NOT NULL,
  title TEXT,
  body TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_key, channel)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view templates" ON public.message_templates FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'reception'));

CREATE POLICY "Staff insert templates" ON public.message_templates FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'reception'));

CREATE POLICY "Staff update templates" ON public.message_templates FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'reception'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'reception'));

CREATE POLICY "Admins delete templates" ON public.message_templates FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE TRIGGER update_message_templates_updated_at
BEFORE UPDATE ON public.message_templates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
