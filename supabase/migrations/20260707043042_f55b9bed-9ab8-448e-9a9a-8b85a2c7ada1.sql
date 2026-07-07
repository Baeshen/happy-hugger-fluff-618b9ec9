CREATE OR REPLACE FUNCTION public.my_appointments_with_reminders()
 RETURNS TABLE(id uuid, patient_name text, patient_phone text, appointment_date date, appointment_time time without time zone, status appointment_status, specialty_name_ar text, specialty_name_en text, doctor_name_ar text, doctor_name_en text, reminder_24h boolean, reminder_2h boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id, a.patient_name, a.patient_phone, a.appointment_date, a.appointment_time,
         a.status, s.name_ar, s.name_en, d.name_ar, d.name_en,
         a.reminder_24h, a.reminder_2h
  FROM public.appointments a
  LEFT JOIN public.specialties s ON s.id = a.specialty_id
  LEFT JOIN public.doctors d ON d.id = a.doctor_id
  WHERE auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.phone IS NOT NULL
        AND regexp_replace(p.phone,'\D','','g') = regexp_replace(a.patient_phone,'\D','','g')
    )
  ORDER BY a.appointment_date DESC, a.appointment_time DESC;
$function$;