
-- 1) Extend branches with HMG-parity fields
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS emergency_phone text,
  ADD COLUMN IF NOT EXISTS working_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS hero_image_url text,
  ADD COLUMN IF NOT EXISTS description_ar text,
  ADD COLUMN IF NOT EXISTS description_en text,
  ADD COLUMN IF NOT EXISTS map_embed_url text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- 2) Excellence centers (Centers of Excellence) — global or per-branch
CREATE TABLE IF NOT EXISTS public.excellence_centers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  short_ar text,
  short_en text,
  description_ar text,
  description_en text,
  hero_image_url text,
  icon text,
  specialty_id uuid REFERENCES public.specialties(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.excellence_centers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.excellence_centers TO authenticated;
GRANT ALL ON public.excellence_centers TO service_role;

ALTER TABLE public.excellence_centers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active excellence centers"
  ON public.excellence_centers FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "Admins manage excellence centers"
  ON public.excellence_centers FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE TRIGGER trg_excellence_centers_updated_at
  BEFORE UPDATE ON public.excellence_centers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Many-to-many: excellence centers ↔ branches (which branches offer which center)
CREATE TABLE IF NOT EXISTS public.branch_excellence_centers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  excellence_center_id uuid NOT NULL REFERENCES public.excellence_centers(id) ON DELETE CASCADE,
  is_featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, excellence_center_id)
);

CREATE INDEX IF NOT EXISTS idx_bec_branch ON public.branch_excellence_centers(branch_id);
CREATE INDEX IF NOT EXISTS idx_bec_center ON public.branch_excellence_centers(excellence_center_id);

GRANT SELECT ON public.branch_excellence_centers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.branch_excellence_centers TO authenticated;
GRANT ALL ON public.branch_excellence_centers TO service_role;

ALTER TABLE public.branch_excellence_centers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view branch/excellence links"
  ON public.branch_excellence_centers FOR SELECT
  USING (true);

CREATE POLICY "Branch admins manage their branch links"
  ON public.branch_excellence_centers FOR ALL
  USING (
    public.has_role(auth.uid(),'super_admin')
    OR (public.has_role(auth.uid(),'admin') AND public.has_branch_access(auth.uid(), branch_id))
  )
  WITH CHECK (
    public.has_role(auth.uid(),'super_admin')
    OR (public.has_role(auth.uid(),'admin') AND public.has_branch_access(auth.uid(), branch_id))
  );

-- 4) Public helper RPCs for the site
CREATE OR REPLACE FUNCTION public.list_public_branches()
RETURNS TABLE (
  id uuid, slug text, name_ar text, name_en text,
  city_ar text, city_en text, phone text, emergency_phone text,
  address_ar text, address_en text, lat double precision, lng double precision,
  hero_image_url text, description_ar text, description_en text,
  working_hours jsonb, map_embed_url text, sort_order integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, slug, name_ar, name_en, city_ar, city_en, phone, emergency_phone,
         address_ar, address_en, lat, lng, hero_image_url, description_ar, description_en,
         working_hours, map_embed_url, sort_order
  FROM public.branches
  WHERE is_active = true
  ORDER BY sort_order, name_ar;
$$;

CREATE OR REPLACE FUNCTION public.list_public_excellence_centers(_branch_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid, slug text, name_ar text, name_en text,
  short_ar text, short_en text, description_ar text, description_en text,
  hero_image_url text, icon text, specialty_id uuid, sort_order integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT ec.id, ec.slug, ec.name_ar, ec.name_en,
         ec.short_ar, ec.short_en, ec.description_ar, ec.description_en,
         ec.hero_image_url, ec.icon, ec.specialty_id, ec.sort_order
  FROM public.excellence_centers ec
  LEFT JOIN public.branch_excellence_centers bec ON bec.excellence_center_id = ec.id
  WHERE ec.is_active = true
    AND (_branch_id IS NULL OR bec.branch_id = _branch_id)
  ORDER BY ec.sort_order, ec.name_ar;
$$;
