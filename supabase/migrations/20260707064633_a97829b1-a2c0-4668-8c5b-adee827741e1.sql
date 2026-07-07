-- 1) doctor_leaves table
CREATE TABLE IF NOT EXISTS public.doctor_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  all_day boolean NOT NULL DEFAULT true,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT doctor_leaves_range_chk CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS doctor_leaves_doctor_dates_idx
  ON public.doctor_leaves (doctor_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS doctor_leaves_branch_idx
  ON public.doctor_leaves (branch_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctor_leaves TO authenticated;
GRANT ALL ON public.doctor_leaves TO service_role;

ALTER TABLE public.doctor_leaves ENABLE ROW LEVEL SECURITY;

-- Staff (with branch access) can read leaves
CREATE POLICY "doctor_leaves_staff_read" ON public.doctor_leaves
FOR SELECT TO authenticated
USING (
  (public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'reception')
    OR public.has_role(auth.uid(),'doctor'))
  AND public.has_branch_access(auth.uid(), branch_id)
);

-- Only admin/super_admin write
CREATE POLICY "doctor_leaves_admin_insert" ON public.doctor_leaves
FOR INSERT TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  AND public.has_branch_access(auth.uid(), branch_id)
);

CREATE POLICY "doctor_leaves_admin_update" ON public.doctor_leaves
FOR UPDATE TO authenticated
USING (
  (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  AND public.has_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
  (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  AND public.has_branch_access(auth.uid(), branch_id)
);

CREATE POLICY "doctor_leaves_admin_delete" ON public.doctor_leaves
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
);

CREATE TRIGGER doctor_leaves_set_updated_at
BEFORE UPDATE ON public.doctor_leaves
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Occupancy per doctor
CREATE OR REPLACE FUNCTION public.doctor_occupancy(_branch_id uuid DEFAULT NULL, _days integer DEFAULT 30)
RETURNS TABLE(
  doctor_id uuid,
  name_ar text,
  name_en text,
  branch_id uuid,
  specialty_id uuid,
  specialty_name_ar text,
  is_active boolean,
  booked bigint,
  capacity bigint,
  occupancy_pct numeric,
  leave_days bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  start_d date := today - GREATEST(_days,1) + 1;
BEGIN
  PERFORM public._assert_staff();
  RETURN QUERY
  WITH days AS (
    SELECT generate_series(start_d, today, interval '1 day')::date AS d
  ),
  base AS (
    SELECT d.id, d.name_ar, d.name_en, d.branch_id, d.specialty_id, s.name_ar AS sp_name, d.is_active
    FROM public.doctors d
    LEFT JOIN public.specialties s ON s.id = d.specialty_id
    WHERE (_branch_id IS NULL OR d.branch_id = _branch_id)
  ),
  cap AS (
    SELECT b.id AS doctor_id,
      COALESCE(SUM(
        (EXTRACT(EPOCH FROM (a.end_time - a.start_time))/60 / NULLIF(a.slot_minutes,0))::int
      ), 0)::bigint AS capacity
    FROM base b
    LEFT JOIN days dd ON true
    LEFT JOIN public.availability a
      ON a.doctor_id = b.id
     AND a.weekday = EXTRACT(DOW FROM dd.d)::int
    LEFT JOIN public.doctor_leaves l
      ON l.doctor_id = b.id
     AND dd.d BETWEEN l.start_date AND l.end_date
    WHERE l.id IS NULL
    GROUP BY b.id
  ),
  bk AS (
    SELECT ap.doctor_id, count(*)::bigint AS booked
    FROM public.appointments ap
    WHERE ap.appointment_date BETWEEN start_d AND today
      AND ap.status IN ('new','confirmed','completed')
      AND (_branch_id IS NULL OR ap.branch_id = _branch_id)
    GROUP BY ap.doctor_id
  ),
  lv AS (
    SELECT l.doctor_id,
      SUM(LEAST(l.end_date, today) - GREATEST(l.start_date, start_d) + 1)::bigint AS leave_days
    FROM public.doctor_leaves l
    WHERE l.start_date <= today AND l.end_date >= start_d
      AND (_branch_id IS NULL OR l.branch_id = _branch_id OR l.branch_id IS NULL)
    GROUP BY l.doctor_id
  )
  SELECT b.id, b.name_ar, b.name_en, b.branch_id, b.specialty_id, b.sp_name, b.is_active,
    COALESCE(bk.booked,0),
    COALESCE(cap.capacity,0),
    CASE WHEN COALESCE(cap.capacity,0) > 0
         THEN round(100.0 * COALESCE(bk.booked,0) / cap.capacity, 1)
         ELSE 0 END,
    COALESCE(lv.leave_days,0)
  FROM base b
  LEFT JOIN cap ON cap.doctor_id = b.id
  LEFT JOIN bk  ON bk.doctor_id  = b.id
  LEFT JOIN lv  ON lv.doctor_id  = b.id
  ORDER BY b.is_active DESC, b.name_ar;
END $$;

-- 3) List leaves in window
CREATE OR REPLACE FUNCTION public.list_doctor_leaves(
  _from date,
  _to date,
  _branch_id uuid DEFAULT NULL,
  _doctor_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  doctor_id uuid,
  branch_id uuid,
  start_date date,
  end_date date,
  all_day boolean,
  reason text,
  doctor_name_ar text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._assert_staff();
  RETURN QUERY
  SELECT l.id, l.doctor_id, l.branch_id, l.start_date, l.end_date, l.all_day, l.reason,
         d.name_ar, l.created_at
  FROM public.doctor_leaves l
  JOIN public.doctors d ON d.id = l.doctor_id
  WHERE l.end_date >= _from AND l.start_date <= _to
    AND (_branch_id IS NULL OR l.branch_id = _branch_id OR l.branch_id IS NULL)
    AND (_doctor_id IS NULL OR l.doctor_id = _doctor_id)
  ORDER BY l.start_date DESC;
END $$;