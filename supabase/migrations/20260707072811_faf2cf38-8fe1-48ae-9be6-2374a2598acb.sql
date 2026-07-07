-- 1) Enum for patient status
DO $$ BEGIN
  CREATE TYPE public.patient_status AS ENUM ('active','inactive','archived','deceased');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Add columns (status defaults to 'active'; tags nullable text[])
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS status public.patient_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

-- 3) Backfill from existing is_active
UPDATE public.patients SET status = 'inactive' WHERE is_active = false AND status = 'active';

-- 4) Indexes
CREATE INDEX IF NOT EXISTS patients_status_idx ON public.patients(status);
CREATE INDEX IF NOT EXISTS patients_tags_idx ON public.patients USING GIN(tags);

-- 5) Sync trigger: keep is_active mirroring status='active'
CREATE OR REPLACE FUNCTION public.sync_patient_is_active()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.is_active := (NEW.status = 'active');
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS patients_sync_is_active ON public.patients;
CREATE TRIGGER patients_sync_is_active
BEFORE INSERT OR UPDATE OF status ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.sync_patient_is_active();