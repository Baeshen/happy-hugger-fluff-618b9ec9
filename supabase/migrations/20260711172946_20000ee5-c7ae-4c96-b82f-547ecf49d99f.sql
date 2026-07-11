
ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS photos text[] NOT NULL DEFAULT '{}';
