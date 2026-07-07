ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS slug text;

UPDATE public.doctors
SET slug = regexp_replace(
  lower(regexp_replace(coalesce(name_en, id::text), '^dr\.?\s*', '', 'i')),
  '[^a-z0-9]+', '-', 'g'
)
WHERE slug IS NULL;

UPDATE public.doctors
SET slug = trim(both '-' from slug);

CREATE UNIQUE INDEX IF NOT EXISTS doctors_slug_key ON public.doctors(slug);