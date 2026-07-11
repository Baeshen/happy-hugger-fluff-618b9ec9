
-- RPC: next available appointment slot for a batch of doctors
-- Scans next 30 days: intersects doctors.availability with doctor_leaves and
-- existing (non-cancelled) appointments, respects slot_minutes, skips past
-- times for today. Returns (doctor_id, next_slot_at) rows.

CREATE OR REPLACE FUNCTION public.list_doctors_next_slot(_doctor_ids uuid[])
RETURNS TABLE(doctor_id uuid, next_slot_at timestamptz, next_slot_branch_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input_doctors AS (
    SELECT DISTINCT unnest(_doctor_ids) AS doctor_id
  ),
  days AS (
    -- Look up to 30 days ahead (inclusive of today)
    SELECT (CURRENT_DATE + gs)::date AS day
    FROM generate_series(0, 30) AS gs
  ),
  -- All potential slot start-times per doctor per day
  candidate_slots AS (
    SELECT
      a.doctor_id,
      a.branch_id,
      d.day,
      ((d.day::timestamp) + a.start_time + (slot_idx * (a.slot_minutes || ' minutes')::interval)) AS slot_ts
    FROM input_doctors idoc
    JOIN availability a ON a.doctor_id = idoc.doctor_id
    JOIN days d ON EXTRACT(DOW FROM d.day)::int = a.weekday
    CROSS JOIN LATERAL generate_series(
      0,
      GREATEST(
        (EXTRACT(EPOCH FROM (a.end_time - a.start_time)) / (a.slot_minutes * 60))::int - 1,
        0
      )
    ) AS slot_idx
  ),
  filtered AS (
    SELECT cs.*
    FROM candidate_slots cs
    -- Must be strictly in the future (skip past times today)
    WHERE cs.slot_ts > now()
      -- Not falling inside an all-day doctor leave for that branch/day
      AND NOT EXISTS (
        SELECT 1 FROM doctor_leaves dl
        WHERE dl.doctor_id = cs.doctor_id
          AND (dl.branch_id IS NULL OR dl.branch_id = cs.branch_id)
          AND cs.day BETWEEN dl.start_date AND dl.end_date
      )
      -- Not already booked (active statuses only)
      AND NOT EXISTS (
        SELECT 1 FROM appointments ap
        WHERE ap.doctor_id = cs.doctor_id
          AND ap.appointment_date = cs.day
          AND ap.appointment_time = cs.slot_ts::time
          AND ap.status IN ('new', 'confirmed')
      )
  ),
  ranked AS (
    SELECT
      doctor_id,
      slot_ts,
      branch_id,
      ROW_NUMBER() OVER (PARTITION BY doctor_id ORDER BY slot_ts ASC) AS rn
    FROM filtered
  )
  SELECT doctor_id, slot_ts AS next_slot_at, branch_id AS next_slot_branch_id
  FROM ranked
  WHERE rn = 1;
$$;

GRANT EXECUTE ON FUNCTION public.list_doctors_next_slot(uuid[]) TO anon, authenticated, service_role;
