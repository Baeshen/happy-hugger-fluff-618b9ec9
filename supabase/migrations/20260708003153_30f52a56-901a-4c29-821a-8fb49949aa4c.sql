
-- Helper: assert caller can access the requested branch (or is super_admin)
CREATE OR REPLACE FUNCTION public._assert_branch_access(_branch_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'super_admin') THEN
    RETURN;
  END IF;
  IF _branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_id is required for non–super-admin callers' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_branch_access(auth.uid(), _branch_id) THEN
    RAISE EXCEPTION 'forbidden: no access to branch' USING ERRCODE = '42501';
  END IF;
END $$;

-- ── appointments: add branch scoping to staff policies ──
DROP POLICY IF EXISTS "staff read appointments" ON public.appointments;
CREATE POLICY "staff read appointments" ON public.appointments
FOR SELECT TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'reception'))
  AND (public.has_role(auth.uid(), 'super_admin') OR public.has_branch_access(auth.uid(), branch_id))
);

DROP POLICY IF EXISTS "staff update appointments" ON public.appointments;
CREATE POLICY "staff update appointments" ON public.appointments
FOR UPDATE TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'reception'))
  AND (public.has_role(auth.uid(), 'super_admin') OR public.has_branch_access(auth.uid(), branch_id))
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'reception'))
  AND (public.has_role(auth.uid(), 'super_admin') OR public.has_branch_access(auth.uid(), branch_id))
);

DROP POLICY IF EXISTS "admins delete appointments" ON public.appointments;
CREATE POLICY "admins delete appointments" ON public.appointments
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  AND (public.has_role(auth.uid(), 'super_admin') OR public.has_branch_access(auth.uid(), branch_id))
);

-- ── medicine_orders: same treatment ──
DROP POLICY IF EXISTS "staff read med orders" ON public.medicine_orders;
CREATE POLICY "staff read med orders" ON public.medicine_orders
FOR SELECT TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacy'))
  AND (public.has_role(auth.uid(), 'super_admin') OR public.has_branch_access(auth.uid(), branch_id))
);

DROP POLICY IF EXISTS "staff update med orders" ON public.medicine_orders;
CREATE POLICY "staff update med orders" ON public.medicine_orders
FOR UPDATE TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacy'))
  AND (public.has_role(auth.uid(), 'super_admin') OR public.has_branch_access(auth.uid(), branch_id))
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacy'))
  AND (public.has_role(auth.uid(), 'super_admin') OR public.has_branch_access(auth.uid(), branch_id))
);

DROP POLICY IF EXISTS "admins delete med orders" ON public.medicine_orders;
CREATE POLICY "admins delete med orders" ON public.medicine_orders
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  AND (public.has_role(auth.uid(), 'super_admin') OR public.has_branch_access(auth.uid(), branch_id))
);

-- ── Aggregate/dashboard RPCs: enforce branch access ──
CREATE OR REPLACE FUNCTION public.dashboard_appointments_daily(_branch_id uuid DEFAULT NULL::uuid, _days integer DEFAULT 30)
 RETURNS TABLE(day date, total bigint, confirmed bigint, cancelled bigint, no_show bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE today date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
BEGIN
  PERFORM public._assert_staff();
  PERFORM public._assert_branch_access(_branch_id);
  RETURN QUERY
  WITH days AS (SELECT generate_series(today - (_days-1), today, interval '1 day')::date AS day)
  SELECT d.day,
         count(a.id) FILTER (WHERE a.status IS NOT NULL),
         count(a.id) FILTER (WHERE a.status='confirmed'),
         count(a.id) FILTER (WHERE a.status='cancelled'),
         count(a.id) FILTER (WHERE a.status='no_show')
  FROM days d
  LEFT JOIN public.appointments a
    ON a.appointment_date = d.day
   AND (_branch_id IS NULL OR a.branch_id = _branch_id)
  GROUP BY d.day ORDER BY d.day;
END $function$;

CREATE OR REPLACE FUNCTION public.dashboard_status_breakdown(_branch_id uuid DEFAULT NULL::uuid, _days integer DEFAULT 30)
 RETURNS TABLE(status text, count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE today date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
BEGIN
  PERFORM public._assert_staff();
  PERFORM public._assert_branch_access(_branch_id);
  RETURN QUERY
  SELECT a.status::text, count(*)::bigint
  FROM public.appointments a
  WHERE a.appointment_date BETWEEN today - (_days-1) AND today
    AND (_branch_id IS NULL OR a.branch_id = _branch_id)
  GROUP BY a.status ORDER BY count(*) DESC;
END $function$;

CREATE OR REPLACE FUNCTION public.dashboard_by_specialty(_branch_id uuid DEFAULT NULL::uuid, _days integer DEFAULT 30)
 RETURNS TABLE(specialty_id uuid, name_ar text, name_en text, count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE today date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
BEGIN
  PERFORM public._assert_staff();
  PERFORM public._assert_branch_access(_branch_id);
  RETURN QUERY
  SELECT s.id, s.name_ar, s.name_en, count(a.id)::bigint
  FROM public.appointments a
  LEFT JOIN public.specialties s ON s.id = a.specialty_id
  WHERE a.appointment_date BETWEEN today - (_days-1) AND today
    AND (_branch_id IS NULL OR a.branch_id = _branch_id)
  GROUP BY s.id, s.name_ar, s.name_en
  ORDER BY count(a.id) DESC LIMIT 20;
END $function$;

CREATE OR REPLACE FUNCTION public.dashboard_peak_hours(_branch_id uuid DEFAULT NULL::uuid, _days integer DEFAULT 30)
 RETURNS TABLE(hour integer, count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE today date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
BEGIN
  PERFORM public._assert_staff();
  PERFORM public._assert_branch_access(_branch_id);
  RETURN QUERY
  WITH hours AS (SELECT generate_series(0,23) AS hour)
  SELECT h.hour::int, count(a.id)::bigint
  FROM hours h
  LEFT JOIN public.appointments a
    ON EXTRACT(HOUR FROM a.appointment_time)::int = h.hour
   AND a.appointment_date BETWEEN today - (_days-1) AND today
   AND (_branch_id IS NULL OR a.branch_id = _branch_id)
  GROUP BY h.hour ORDER BY h.hour;
END $function$;

CREATE OR REPLACE FUNCTION public.dashboard_upcoming(_branch_id uuid DEFAULT NULL::uuid, _limit integer DEFAULT 25)
 RETURNS TABLE(id uuid, patient_name text, patient_phone text, appointment_date date, appointment_time time without time zone, status appointment_status, doctor_name_ar text, specialty_name_ar text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE today date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
BEGIN
  PERFORM public._assert_staff();
  PERFORM public._assert_branch_access(_branch_id);
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
END $function$;

CREATE OR REPLACE FUNCTION public.dashboard_recent_activity(_branch_id uuid DEFAULT NULL::uuid, _limit integer DEFAULT 15)
 RETURNS TABLE(id uuid, appointment_id uuid, changed_at timestamp with time zone, old_status appointment_status, new_status appointment_status, reason text, patient_name text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._assert_staff();
  PERFORM public._assert_branch_access(_branch_id);
  RETURN QUERY
  SELECT au.id, au.appointment_id, au.changed_at,
         au.old_status, au.new_status, au.reason, a.patient_name
  FROM public.appointment_audit au
  JOIN public.appointments a ON a.id = au.appointment_id
  WHERE (_branch_id IS NULL OR a.branch_id = _branch_id)
  ORDER BY au.changed_at DESC
  LIMIT _limit;
END $function$;

CREATE OR REPLACE FUNCTION public.dashboard_kpis(_branch_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  week_start date := today - 6;
  result jsonb;
BEGIN
  PERFORM public._assert_staff();
  PERFORM public._assert_branch_access(_branch_id);
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
END $function$;

CREATE OR REPLACE FUNCTION public.doctor_occupancy(_branch_id uuid DEFAULT NULL::uuid, _days integer DEFAULT 30)
 RETURNS TABLE(doctor_id uuid, name_ar text, name_en text, branch_id uuid, specialty_id uuid, specialty_name_ar text, is_active boolean, booked bigint, capacity bigint, occupancy_pct numeric, leave_days bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  start_d date := today - GREATEST(_days,1) + 1;
BEGIN
  PERFORM public._assert_staff();
  PERFORM public._assert_branch_access(_branch_id);
  RETURN QUERY
  WITH days AS (SELECT generate_series(start_d, today, interval '1 day')::date AS d),
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
END $function$;

CREATE OR REPLACE FUNCTION public.list_doctor_leaves(_from date, _to date, _branch_id uuid DEFAULT NULL::uuid, _doctor_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, doctor_id uuid, branch_id uuid, start_date date, end_date date, all_day boolean, reason text, doctor_name_ar text, created_at timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._assert_staff();
  PERFORM public._assert_branch_access(_branch_id);
  RETURN QUERY
  SELECT l.id, l.doctor_id, l.branch_id, l.start_date, l.end_date, l.all_day, l.reason,
         d.name_ar, l.created_at
  FROM public.doctor_leaves l
  JOIN public.doctors d ON d.id = l.doctor_id
  WHERE l.end_date >= _from AND l.start_date <= _to
    AND (_branch_id IS NULL OR l.branch_id = _branch_id OR l.branch_id IS NULL)
    AND (_doctor_id IS NULL OR l.doctor_id = _doctor_id)
  ORDER BY l.start_date DESC;
END $function$;
