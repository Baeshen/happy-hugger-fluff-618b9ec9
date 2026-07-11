
-- Extend doctors with public-facing fields for the new listing/booking UI
ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('male','female')),
  ADD COLUMN IF NOT EXISTS years_experience integer,
  ADD COLUMN IF NOT EXISTS booking_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS education_ar text,
  ADD COLUMN IF NOT EXISTS education_en text,
  ADD COLUMN IF NOT EXISTS experience_ar text,
  ADD COLUMN IF NOT EXISTS experience_en text;

-- Seed sensible defaults for existing doctors
UPDATE public.doctors
  SET languages = COALESCE(languages, ARRAY['ar','en']::text[])
  WHERE languages IS NULL OR cardinality(languages) = 0;

-- Public RPC: list active doctors with filters + aggregated rating
CREATE OR REPLACE FUNCTION public.list_public_doctors(
  _specialty_slug text DEFAULT NULL,
  _branch_id uuid DEFAULT NULL,
  _gender text DEFAULT NULL,
  _language text DEFAULT NULL,
  _q text DEFAULT NULL,
  _limit int DEFAULT 60,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  slug text,
  name_ar text,
  name_en text,
  title_ar text,
  title_en text,
  bio_ar text,
  bio_en text,
  photo_url text,
  gender text,
  years_experience int,
  languages text[],
  booking_enabled boolean,
  branch_id uuid,
  branch_name_ar text,
  branch_name_en text,
  specialty_id uuid,
  specialty_slug text,
  specialty_name_ar text,
  specialty_name_en text,
  ratings_count bigint,
  avg_rating numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, d.slug, d.name_ar, d.name_en, d.title_ar, d.title_en, d.bio_ar, d.bio_en,
         d.photo_url, d.gender, d.years_experience, d.languages, d.booking_enabled,
         d.branch_id, b.name_ar, b.name_en,
         d.specialty_id, s.slug, s.name_ar, s.name_en,
         COALESCE(r.cnt, 0)::bigint,
         COALESCE(ROUND(r.avg_rating, 2), 0)::numeric
  FROM public.doctors d
  LEFT JOIN public.specialties s ON s.id = d.specialty_id
  LEFT JOIN public.branches b ON b.id = d.branch_id
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS cnt, AVG(rating)::numeric AS avg_rating
    FROM public.patient_ratings pr WHERE pr.doctor_id = d.id
  ) r ON true
  WHERE d.is_active = true
    AND (_specialty_slug IS NULL OR s.slug = _specialty_slug)
    AND (_branch_id IS NULL OR d.branch_id = _branch_id)
    AND (_gender IS NULL OR d.gender = _gender)
    AND (_language IS NULL OR _language = ANY(d.languages))
    AND (_q IS NULL OR _q = '' OR d.name_ar ILIKE '%'||_q||'%' OR d.name_en ILIKE '%'||_q||'%')
  ORDER BY d.sort_order, d.name_ar
  LIMIT GREATEST(_limit, 1) OFFSET GREATEST(_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION public.list_public_doctors(text,uuid,text,text,text,int,int) TO anon, authenticated;
