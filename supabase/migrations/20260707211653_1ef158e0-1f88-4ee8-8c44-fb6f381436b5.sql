-- Ratings table
CREATE TABLE public.patient_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  appointment_ref text,
  patient_name text,
  patient_phone text,
  rating smallint NOT NULL,
  comment text,
  source text NOT NULL DEFAULT 'public',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_ratings_rating_range CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT patient_ratings_source_check CHECK (source IN ('public','staff'))
);

CREATE INDEX idx_patient_ratings_branch ON public.patient_ratings(branch_id);
CREATE INDEX idx_patient_ratings_doctor ON public.patient_ratings(doctor_id);
CREATE INDEX idx_patient_ratings_created ON public.patient_ratings(created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.patient_ratings TO authenticated;
GRANT INSERT ON public.patient_ratings TO anon;
GRANT ALL ON public.patient_ratings TO service_role;

ALTER TABLE public.patient_ratings ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a rating (validation happens via submit_public_rating fn)
CREATE POLICY "Anyone can submit rating"
  ON public.patient_ratings FOR INSERT
  TO anon, authenticated
  WITH CHECK (rating BETWEEN 1 AND 5);

-- Staff can view all ratings
CREATE POLICY "Staff can view ratings"
  ON public.patient_ratings FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'reception')
    OR public.has_role(auth.uid(),'doctor')
  );

-- Staff can delete ratings
CREATE POLICY "Staff can delete ratings"
  ON public.patient_ratings FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
  );

-- Aggregated summary (safe to expose)
CREATE OR REPLACE FUNCTION public.get_ratings_summary(
  _branch_id uuid DEFAULT NULL,
  _doctor_id uuid DEFAULT NULL,
  _days int DEFAULT 90
)
RETURNS TABLE(
  scope text,
  entity_id uuid,
  entity_name text,
  ratings_count bigint,
  avg_rating numeric,
  stars_1 bigint,
  stars_2 bigint,
  stars_3 bigint,
  stars_4 bigint,
  stars_5 bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cutoff timestamptz := now() - make_interval(days => GREATEST(_days,1));
BEGIN
  PERFORM public._assert_staff();
  RETURN QUERY
  -- Per doctor
  SELECT 'doctor'::text, d.id, d.name_ar,
    count(r.id)::bigint,
    ROUND(AVG(r.rating)::numeric, 2),
    count(*) FILTER (WHERE r.rating = 1)::bigint,
    count(*) FILTER (WHERE r.rating = 2)::bigint,
    count(*) FILTER (WHERE r.rating = 3)::bigint,
    count(*) FILTER (WHERE r.rating = 4)::bigint,
    count(*) FILTER (WHERE r.rating = 5)::bigint
  FROM public.doctors d
  LEFT JOIN public.patient_ratings r
    ON r.doctor_id = d.id AND r.created_at >= cutoff
   AND (_branch_id IS NULL OR r.branch_id = _branch_id)
  WHERE (_doctor_id IS NULL OR d.id = _doctor_id)
    AND (_branch_id IS NULL OR d.branch_id = _branch_id)
  GROUP BY d.id, d.name_ar
  HAVING count(r.id) > 0
  UNION ALL
  -- Per branch
  SELECT 'branch'::text, b.id, b.name_ar,
    count(r.id)::bigint,
    ROUND(AVG(r.rating)::numeric, 2),
    count(*) FILTER (WHERE r.rating = 1)::bigint,
    count(*) FILTER (WHERE r.rating = 2)::bigint,
    count(*) FILTER (WHERE r.rating = 3)::bigint,
    count(*) FILTER (WHERE r.rating = 4)::bigint,
    count(*) FILTER (WHERE r.rating = 5)::bigint
  FROM public.branches b
  LEFT JOIN public.patient_ratings r
    ON r.branch_id = b.id AND r.created_at >= cutoff
   AND (_doctor_id IS NULL OR r.doctor_id = _doctor_id)
  WHERE (_branch_id IS NULL OR b.id = _branch_id)
  GROUP BY b.id, b.name_ar
  HAVING count(r.id) > 0
  ORDER BY 5 DESC;
END $$;

-- Public submission with validation
CREATE OR REPLACE FUNCTION public.submit_public_rating(
  _branch_id uuid,
  _doctor_id uuid,
  _rating smallint,
  _comment text DEFAULT NULL,
  _patient_name text DEFAULT NULL,
  _patient_phone text DEFAULT NULL,
  _appointment_ref text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _id uuid;
  _comment_clean text := substring(coalesce(trim(_comment),'') for 1000);
  _name_clean text := substring(coalesce(trim(_patient_name),'') for 100);
  _phone_clean text := regexp_replace(coalesce(_patient_phone,''),'\D','','g');
BEGIN
  IF _rating < 1 OR _rating > 5 THEN
    RAISE EXCEPTION 'التقييم يجب أن يكون بين 1 و 5';
  END IF;
  IF _branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.branches WHERE id = _branch_id) THEN
    RAISE EXCEPTION 'الفرع غير موجود';
  END IF;
  IF _doctor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.doctors WHERE id = _doctor_id) THEN
    RAISE EXCEPTION 'الطبيب غير موجود';
  END IF;
  IF _branch_id IS NULL AND _doctor_id IS NULL THEN
    RAISE EXCEPTION 'يجب تحديد الفرع أو الطبيب على الأقل';
  END IF;

  INSERT INTO public.patient_ratings
    (branch_id, doctor_id, appointment_ref, patient_name, patient_phone, rating, comment, source, created_by)
  VALUES
    (_branch_id, _doctor_id, NULLIF(_appointment_ref,''),
     NULLIF(_name_clean,''), NULLIF(_phone_clean,''),
     _rating, NULLIF(_comment_clean,''),
     CASE WHEN auth.uid() IS NULL THEN 'public' ELSE 'public' END,
     auth.uid())
  RETURNING id INTO _id;

  RETURN _id;
END $$;

GRANT EXECUTE ON FUNCTION public.submit_public_rating(uuid, uuid, smallint, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ratings_summary(uuid, uuid, int) TO authenticated;

-- List public/safe branches & doctors for the rating page (name only, active only)
CREATE OR REPLACE FUNCTION public.list_public_branches_for_rating()
RETURNS TABLE(id uuid, name_ar text, name_en text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, name_ar, name_en FROM public.branches ORDER BY name_ar;
$$;

CREATE OR REPLACE FUNCTION public.list_public_doctors_for_rating(_branch_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, name_ar text, name_en text, branch_id uuid, specialty_name_ar text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d.id, d.name_ar, d.name_en, d.branch_id, s.name_ar
  FROM public.doctors d
  LEFT JOIN public.specialties s ON s.id = d.specialty_id
  WHERE COALESCE(d.is_active, true) = true
    AND (_branch_id IS NULL OR d.branch_id = _branch_id)
  ORDER BY d.name_ar;
$$;

GRANT EXECUTE ON FUNCTION public.list_public_branches_for_rating() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_doctors_for_rating(uuid) TO anon, authenticated;