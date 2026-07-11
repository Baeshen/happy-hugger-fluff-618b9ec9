
CREATE OR REPLACE FUNCTION public.list_public_doctor_ratings(_doctor_id uuid, _limit int DEFAULT 20)
RETURNS TABLE (
  id uuid,
  rating smallint,
  comment text,
  patient_name text,
  created_at timestamptz,
  staff_reply text,
  staff_reply_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.rating, r.comment,
    CASE WHEN r.patient_name IS NULL OR length(trim(r.patient_name)) = 0
         THEN NULL
         ELSE split_part(trim(r.patient_name), ' ', 1) || ' ' ||
              COALESCE(left(split_part(trim(r.patient_name), ' ', 2), 1) || '.', '')
    END AS patient_name,
    r.created_at, r.staff_reply, r.staff_reply_at
  FROM public.patient_ratings r
  WHERE r.doctor_id = _doctor_id
    AND r.rating IS NOT NULL
  ORDER BY r.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 20), 100));
$$;

GRANT EXECUTE ON FUNCTION public.list_public_doctor_ratings(uuid, int) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_doctor_rating_summary(_doctor_id uuid)
RETURNS TABLE (average numeric, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ROUND(AVG(rating)::numeric, 1) AS average, COUNT(*)::bigint AS count
  FROM public.patient_ratings
  WHERE doctor_id = _doctor_id AND rating IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_doctor_rating_summary(uuid) TO anon, authenticated;
