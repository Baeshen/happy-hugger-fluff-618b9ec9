
-- 1) doctor_branches junction table
CREATE TABLE public.doctor_branches (
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (doctor_id, branch_id)
);
CREATE INDEX idx_doctor_branches_branch ON public.doctor_branches(branch_id);

GRANT SELECT ON public.doctor_branches TO anon, authenticated;
GRANT ALL ON public.doctor_branches TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.doctor_branches TO authenticated;

ALTER TABLE public.doctor_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read doctor_branches"
  ON public.doctor_branches FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "admins manage doctor_branches"
  ON public.doctor_branches FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- Backfill from existing single branch_id
INSERT INTO public.doctor_branches (doctor_id, branch_id, is_primary)
SELECT id, branch_id, true FROM public.doctors WHERE branch_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Keep doctors.branch_id in sync when a primary is set (back-compat)
CREATE OR REPLACE FUNCTION public.sync_doctor_primary_branch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_primary THEN
    UPDATE public.doctors SET branch_id = NEW.branch_id WHERE id = NEW.doctor_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.is_primary AND NOT OLD.is_primary THEN
    UPDATE public.doctors SET branch_id = NEW.branch_id WHERE id = NEW.doctor_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_sync_doctor_primary_branch
  AFTER INSERT OR UPDATE OF is_primary, branch_id ON public.doctor_branches
  FOR EACH ROW EXECUTE FUNCTION public.sync_doctor_primary_branch();

-- 2) Ratings aggregate columns on doctors
ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS avg_rating numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ratings_count integer NOT NULL DEFAULT 0;

-- Backfill aggregates
UPDATE public.doctors d SET
  avg_rating = COALESCE(sub.avg_r, 0),
  ratings_count = COALESCE(sub.cnt, 0)
FROM (
  SELECT doctor_id, ROUND(AVG(rating)::numeric, 2) AS avg_r, count(*)::int AS cnt
  FROM public.patient_ratings
  WHERE doctor_id IS NOT NULL
  GROUP BY doctor_id
) sub
WHERE sub.doctor_id = d.id;

-- Recompute on rating change
CREATE OR REPLACE FUNCTION public.refresh_doctor_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _did uuid;
BEGIN
  _did := COALESCE(NEW.doctor_id, OLD.doctor_id);
  IF _did IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  UPDATE public.doctors d SET
    avg_rating = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM public.patient_ratings WHERE doctor_id = _did), 0),
    ratings_count = COALESCE((SELECT count(*)::int FROM public.patient_ratings WHERE doctor_id = _did), 0)
  WHERE d.id = _did;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_refresh_doctor_rating ON public.patient_ratings;
CREATE TRIGGER trg_refresh_doctor_rating
  AFTER INSERT OR UPDATE OF rating OR DELETE ON public.patient_ratings
  FOR EACH ROW EXECUTE FUNCTION public.refresh_doctor_rating();

-- 3) Public listing RPC
CREATE OR REPLACE FUNCTION public.list_public_doctors(
  _specialty uuid DEFAULT NULL,
  _branch uuid DEFAULT NULL,
  _gender text DEFAULT NULL,
  _language text DEFAULT NULL,
  _q text DEFAULT NULL,
  _limit int DEFAULT 24,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  slug text,
  name_ar text,
  name_en text,
  title_ar text,
  title_en text,
  photo_url text,
  gender text,
  years_experience int,
  languages text[],
  specialty_id uuid,
  specialty_name_ar text,
  specialty_name_en text,
  branch_ids uuid[],
  branch_names_ar text[],
  branch_slugs text[],
  avg_rating numeric,
  ratings_count int,
  booking_enabled boolean,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _q_norm text := NULLIF(trim(COALESCE(_q,'')), '');
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT d.*,
           s.name_ar AS s_name_ar, s.name_en AS s_name_en,
           COALESCE(
             (SELECT array_agg(db.branch_id ORDER BY db.is_primary DESC)
                FROM public.doctor_branches db WHERE db.doctor_id = d.id),
             CASE WHEN d.branch_id IS NOT NULL THEN ARRAY[d.branch_id] ELSE ARRAY[]::uuid[] END
           ) AS b_ids,
           COALESCE(
             (SELECT array_agg(b.name_ar ORDER BY db.is_primary DESC)
                FROM public.doctor_branches db JOIN public.branches b ON b.id = db.branch_id
                WHERE db.doctor_id = d.id),
             ARRAY[]::text[]
           ) AS b_names,
           COALESCE(
             (SELECT array_agg(b.slug ORDER BY db.is_primary DESC)
                FROM public.doctor_branches db JOIN public.branches b ON b.id = db.branch_id
                WHERE db.doctor_id = d.id),
             ARRAY[]::text[]
           ) AS b_slugs
    FROM public.doctors d
    LEFT JOIN public.specialties s ON s.id = d.specialty_id
    WHERE d.is_active = true
      AND (_specialty IS NULL OR d.specialty_id = _specialty)
      AND (_gender IS NULL OR d.gender = _gender)
      AND (_language IS NULL OR _language = ANY(COALESCE(d.languages, ARRAY['ar','en'])))
      AND (_q_norm IS NULL OR d.name_ar ILIKE '%'||_q_norm||'%' OR d.name_en ILIKE '%'||_q_norm||'%')
      AND (
        _branch IS NULL
        OR d.branch_id = _branch
        OR EXISTS (SELECT 1 FROM public.doctor_branches db WHERE db.doctor_id = d.id AND db.branch_id = _branch)
      )
  ),
  counted AS (SELECT count(*) AS c FROM filtered)
  SELECT f.id, f.slug, f.name_ar, f.name_en, f.title_ar, f.title_en, f.photo_url,
         f.gender, f.years_experience, COALESCE(f.languages, ARRAY['ar','en']),
         f.specialty_id, f.s_name_ar, f.s_name_en,
         f.b_ids, f.b_names, f.b_slugs,
         f.avg_rating, f.ratings_count, f.booking_enabled,
         (SELECT c FROM counted)
  FROM filtered f
  ORDER BY f.sort_order, f.ratings_count DESC, f.name_ar
  LIMIT GREATEST(_limit, 1) OFFSET GREATEST(_offset, 0);
END $$;

GRANT EXECUTE ON FUNCTION public.list_public_doctors(uuid,uuid,text,text,text,int,int) TO anon, authenticated;

-- 4) Next available date RPC (best-effort, scan next 14 days)
CREATE OR REPLACE FUNCTION public.doctor_next_available_date(
  _doctor_id uuid,
  _branch_id uuid DEFAULT NULL
)
RETURNS date
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _d date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  _end date := _d + 14;
  _cursor date;
  _weekday smallint;
  _slot_minutes int;
  _slots_total int;
  _slots_taken int;
BEGIN
  IF _doctor_id IS NULL THEN RETURN NULL; END IF;
  _cursor := _d;
  WHILE _cursor <= _end LOOP
    _weekday := EXTRACT(DOW FROM _cursor)::smallint;

    -- Skip if on leave
    IF EXISTS (
      SELECT 1 FROM public.doctor_leaves l
      WHERE l.doctor_id = _doctor_id
        AND _cursor BETWEEN l.start_date AND l.end_date
        AND (_branch_id IS NULL OR l.branch_id IS NULL OR l.branch_id = _branch_id)
    ) THEN
      _cursor := _cursor + 1; CONTINUE;
    END IF;

    -- Total slots for that weekday
    SELECT
      COALESCE(SUM(GREATEST(EXTRACT(EPOCH FROM (av.end_time - av.start_time))/60 / NULLIF(av.slot_minutes,0), 0))::int, 0)
      INTO _slots_total
    FROM public.availability av
    WHERE av.doctor_id = _doctor_id
      AND av.weekday = _weekday
      AND (_branch_id IS NULL OR av.branch_id = _branch_id);

    IF _slots_total > 0 THEN
      SELECT count(*)::int INTO _slots_taken
      FROM public.appointments a
      WHERE a.doctor_id = _doctor_id
        AND a.appointment_date = _cursor
        AND a.status IN ('new','confirmed')
        AND (_branch_id IS NULL OR a.branch_id = _branch_id);

      IF _slots_taken < _slots_total THEN
        RETURN _cursor;
      END IF;
    END IF;

    _cursor := _cursor + 1;
  END LOOP;
  RETURN NULL;
END $$;

GRANT EXECUTE ON FUNCTION public.doctor_next_available_date(uuid, uuid) TO anon, authenticated;
