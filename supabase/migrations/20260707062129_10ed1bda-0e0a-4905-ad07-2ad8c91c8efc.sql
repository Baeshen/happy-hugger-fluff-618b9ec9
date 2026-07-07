
-- =========================================================
-- 1) branches table
-- =========================================================
CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  city_ar text,
  city_en text,
  phone text,
  address_ar text,
  address_en text,
  lat double precision,
  lng double precision,
  is_active boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.branches TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active branches" ON public.branches;
CREATE POLICY "Anyone can view active branches" ON public.branches
  FOR SELECT TO anon, authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage branches" ON public.branches;
CREATE POLICY "Admins can manage branches" ON public.branches
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS branches_set_updated_at ON public.branches;
CREATE TRIGGER branches_set_updated_at
  BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.branches (slug, name_ar, name_en, phone, address_ar, address_en, lat, lng, is_active)
SELECT 'main',
  COALESCE(cs.name_ar, 'مجمع باعشن الطبي'),
  COALESCE(cs.name_en, 'Baeshen Medical Complex'),
  cs.phone, cs.address_ar, cs.address_en, cs.lat, cs.lng, true
FROM public.clinic_settings cs WHERE cs.id = 1
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.branches (slug, name_ar, name_en, is_active)
VALUES ('main', 'مجمع باعشن الطبي', 'Baeshen Medical Complex', true)
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- 2) branch_id columns + backfill
-- =========================================================
ALTER TABLE public.appointments    ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.medicine_orders ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.doctors         ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.availability    ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.notifications   ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.user_roles      ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.clinic_settings ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

DO $$
DECLARE _main uuid;
BEGIN
  SELECT id INTO _main FROM public.branches WHERE slug='main' LIMIT 1;
  IF _main IS NOT NULL THEN
    UPDATE public.appointments    SET branch_id = _main WHERE branch_id IS NULL;
    UPDATE public.medicine_orders SET branch_id = _main WHERE branch_id IS NULL;
    UPDATE public.doctors         SET branch_id = _main WHERE branch_id IS NULL;
    UPDATE public.availability    SET branch_id = _main WHERE branch_id IS NULL;
    UPDATE public.notifications   SET branch_id = _main WHERE branch_id IS NULL;
    UPDATE public.clinic_settings SET branch_id = _main WHERE branch_id IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_branch      ON public.appointments(branch_id);
CREATE INDEX IF NOT EXISTS idx_appointments_branch_date ON public.appointments(branch_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_medicine_orders_branch   ON public.medicine_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_doctors_branch           ON public.doctors(branch_id);
CREATE INDEX IF NOT EXISTS idx_availability_branch      ON public.availability(branch_id);
CREATE INDEX IF NOT EXISTS idx_notifications_branch     ON public.notifications(branch_id);

-- =========================================================
-- 3) has_branch_access helper
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_branch_access(_user_id uuid, _branch_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND (
    public.has_role(_user_id, 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND (ur.branch_id IS NULL OR ur.branch_id = _branch_id)
    )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.has_branch_access(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.has_branch_access(uuid, uuid) TO authenticated;

-- =========================================================
-- 4) staff assertion helper
-- =========================================================
CREATE OR REPLACE FUNCTION public._assert_staff()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'reception')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public._assert_staff() FROM anon;
GRANT  EXECUTE ON FUNCTION public._assert_staff() TO authenticated;

-- =========================================================
-- 5) dashboard functions
-- =========================================================
CREATE OR REPLACE FUNCTION public.dashboard_kpis(_branch_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  week_start date := today - 6;
  result jsonb;
BEGIN
  PERFORM public._assert_staff();
  WITH appts AS (
    SELECT * FROM public.appointments
    WHERE (_branch_id IS NULL OR branch_id = _branch_id)
  ),
  today_appts AS (SELECT * FROM appts WHERE appointment_date = today),
  week_appts  AS (SELECT * FROM appts WHERE appointment_date BETWEEN week_start AND today),
  avail_week AS (
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time))/60 / NULLIF(slot_minutes,0))::int, 0) * 7 AS total_slots
    FROM public.availability
    WHERE (_branch_id IS NULL OR branch_id = _branch_id)
  )
  SELECT jsonb_build_object(
    'today_total',      (SELECT count(*) FROM today_appts),
    'today_confirmed',  (SELECT count(*) FROM today_appts WHERE status='confirmed'),
    'today_new',        (SELECT count(*) FROM today_appts WHERE status='new'),
    'today_cancelled',  (SELECT count(*) FROM today_appts WHERE status='cancelled'),
    'today_no_show',    (SELECT count(*) FROM today_appts WHERE status='no_show'),
    'today_completed',  (SELECT count(*) FROM today_appts WHERE status='completed'),
    'today_unique_patients', (SELECT count(DISTINCT regexp_replace(patient_phone,'\D','','g')) FROM today_appts),
    'pharmacy_today_new', (SELECT count(*) FROM public.medicine_orders
                            WHERE (_branch_id IS NULL OR branch_id=_branch_id)
                              AND created_at >= today AND created_at < today + 1),
    'active_doctors',   (SELECT count(*) FROM public.doctors
                          WHERE (_branch_id IS NULL OR branch_id=_branch_id)
                            AND COALESCE(is_active, true) = true),
    'notifications_unread', (SELECT count(*) FROM public.notifications
                              WHERE (_branch_id IS NULL OR branch_id=_branch_id)
                                AND read_at IS NULL),
    'week_total',       (SELECT count(*) FROM week_appts WHERE status IN ('new','confirmed','completed')),
    'week_capacity',    (SELECT total_slots FROM avail_week),
    'occupancy_pct',    CASE WHEN (SELECT total_slots FROM avail_week) > 0
                             THEN round(100.0 * (SELECT count(*) FROM week_appts WHERE status IN ('new','confirmed','completed'))
                                         / NULLIF((SELECT total_slots FROM avail_week),0), 1)
                             ELSE 0 END
  ) INTO result;
  RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION public.dashboard_kpis(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.dashboard_kpis(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_appointments_daily(_branch_id uuid DEFAULT NULL, _days int DEFAULT 30)
RETURNS TABLE(day date, total bigint, confirmed bigint, cancelled bigint, no_show bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE today date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
BEGIN
  PERFORM public._assert_staff();
  RETURN QUERY
  WITH days AS (SELECT generate_series(today - (_days-1), today, interval '1 day')::date AS day)
  SELECT d.day,
         count(a.id) FILTER (WHERE a.status IS NOT NULL) AS total,
         count(a.id) FILTER (WHERE a.status='confirmed') AS confirmed,
         count(a.id) FILTER (WHERE a.status='cancelled') AS cancelled,
         count(a.id) FILTER (WHERE a.status='no_show')  AS no_show
  FROM days d
  LEFT JOIN public.appointments a
    ON a.appointment_date = d.day
   AND (_branch_id IS NULL OR a.branch_id = _branch_id)
  GROUP BY d.day ORDER BY d.day;
END $$;
REVOKE EXECUTE ON FUNCTION public.dashboard_appointments_daily(uuid,int) FROM anon;
GRANT  EXECUTE ON FUNCTION public.dashboard_appointments_daily(uuid,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_status_breakdown(_branch_id uuid DEFAULT NULL, _days int DEFAULT 30)
RETURNS TABLE(status text, count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE today date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
BEGIN
  PERFORM public._assert_staff();
  RETURN QUERY
  SELECT a.status::text, count(*)::bigint
  FROM public.appointments a
  WHERE a.appointment_date BETWEEN today - (_days-1) AND today
    AND (_branch_id IS NULL OR a.branch_id = _branch_id)
  GROUP BY a.status ORDER BY count(*) DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.dashboard_status_breakdown(uuid,int) FROM anon;
GRANT  EXECUTE ON FUNCTION public.dashboard_status_breakdown(uuid,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_by_specialty(_branch_id uuid DEFAULT NULL, _days int DEFAULT 30)
RETURNS TABLE(specialty_id uuid, name_ar text, name_en text, count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE today date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
BEGIN
  PERFORM public._assert_staff();
  RETURN QUERY
  SELECT s.id, s.name_ar, s.name_en, count(a.id)::bigint
  FROM public.appointments a
  LEFT JOIN public.specialties s ON s.id = a.specialty_id
  WHERE a.appointment_date BETWEEN today - (_days-1) AND today
    AND (_branch_id IS NULL OR a.branch_id = _branch_id)
  GROUP BY s.id, s.name_ar, s.name_en
  ORDER BY count(a.id) DESC LIMIT 20;
END $$;
REVOKE EXECUTE ON FUNCTION public.dashboard_by_specialty(uuid,int) FROM anon;
GRANT  EXECUTE ON FUNCTION public.dashboard_by_specialty(uuid,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_peak_hours(_branch_id uuid DEFAULT NULL, _days int DEFAULT 30)
RETURNS TABLE(hour int, count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE today date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
BEGIN
  PERFORM public._assert_staff();
  RETURN QUERY
  WITH hours AS (SELECT generate_series(0,23) AS hour)
  SELECT h.hour::int, count(a.id)::bigint
  FROM hours h
  LEFT JOIN public.appointments a
    ON EXTRACT(HOUR FROM a.appointment_time)::int = h.hour
   AND a.appointment_date BETWEEN today - (_days-1) AND today
   AND (_branch_id IS NULL OR a.branch_id = _branch_id)
  GROUP BY h.hour ORDER BY h.hour;
END $$;
REVOKE EXECUTE ON FUNCTION public.dashboard_peak_hours(uuid,int) FROM anon;
GRANT  EXECUTE ON FUNCTION public.dashboard_peak_hours(uuid,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_upcoming(_branch_id uuid DEFAULT NULL, _limit int DEFAULT 25)
RETURNS TABLE(id uuid, patient_name text, patient_phone text,
              appointment_date date, appointment_time time,
              status appointment_status, doctor_name_ar text, specialty_name_ar text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE today date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
BEGIN
  PERFORM public._assert_staff();
  RETURN QUERY
  SELECT a.id, a.patient_name, a.patient_phone,
         a.appointment_date, a.appointment_time, a.status,
         d.name_ar, s.name_ar
  FROM public.appointments a
  LEFT JOIN public.doctors d ON d.id = a.doctor_id
  LEFT JOIN public.specialties s ON s.id = a.specialty_id
  WHERE a.appointment_date BETWEEN today AND today + 2
    AND a.status IN ('new','confirmed')
    AND (_branch_id IS NULL OR a.branch_id = _branch_id)
  ORDER BY a.appointment_date, a.appointment_time
  LIMIT _limit;
END $$;
REVOKE EXECUTE ON FUNCTION public.dashboard_upcoming(uuid,int) FROM anon;
GRANT  EXECUTE ON FUNCTION public.dashboard_upcoming(uuid,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_recent_activity(_branch_id uuid DEFAULT NULL, _limit int DEFAULT 15)
RETURNS TABLE(id uuid, appointment_id uuid, changed_at timestamptz,
              old_status appointment_status, new_status appointment_status,
              reason text, patient_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._assert_staff();
  RETURN QUERY
  SELECT au.id, au.appointment_id, au.changed_at,
         au.old_status, au.new_status, au.reason, a.patient_name
  FROM public.appointment_audit au
  JOIN public.appointments a ON a.id = au.appointment_id
  WHERE (_branch_id IS NULL OR a.branch_id = _branch_id)
  ORDER BY au.changed_at DESC
  LIMIT _limit;
END $$;
REVOKE EXECUTE ON FUNCTION public.dashboard_recent_activity(uuid,int) FROM anon;
GRANT  EXECUTE ON FUNCTION public.dashboard_recent_activity(uuid,int) TO authenticated;
