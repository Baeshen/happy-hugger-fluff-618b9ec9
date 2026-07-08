-- Provide the change_reason expected by log_appointment_change() trigger.
SET LOCAL app.change_reason = 'تعارض في الفتحة الزمنية — أُلغي تلقائيًا لتفعيل قيد التفرد';

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY doctor_id, appointment_date, appointment_time
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.appointments
  WHERE doctor_id IS NOT NULL
    AND status NOT IN ('cancelled', 'no_show')
)
UPDATE public.appointments a
SET status = 'cancelled',
    updated_at = now()
FROM ranked r
WHERE a.id = r.id AND r.rn > 1;

RESET app.change_reason;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_doctor_slot_unique_active
  ON public.appointments (doctor_id, appointment_date, appointment_time)
  WHERE doctor_id IS NOT NULL
    AND status NOT IN ('cancelled', 'no_show');