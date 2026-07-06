
-- Force safe defaults on public inserts via triggers (fields the client should not control)
CREATE OR REPLACE FUNCTION public.force_appointment_defaults()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Only sanitize when the caller is anonymous or not staff
  IF auth.uid() IS NULL
     OR NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'reception')) THEN
    NEW.status := 'new';
    NEW.notes := NULL;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_force_appointment_defaults ON public.appointments;
CREATE TRIGGER trg_force_appointment_defaults
  BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.force_appointment_defaults();

CREATE OR REPLACE FUNCTION public.force_medicine_order_defaults()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacy')) THEN
    NEW.status := 'new';
    NEW.notes := NULL;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_force_medicine_order_defaults ON public.medicine_orders;
CREATE TRIGGER trg_force_medicine_order_defaults
  BEFORE INSERT ON public.medicine_orders
  FOR EACH ROW EXECUTE FUNCTION public.force_medicine_order_defaults();

-- Tighten INSERT policies: replace WITH CHECK(true) with basic field validation
DROP POLICY IF EXISTS "anyone create appointments" ON public.appointments;
CREATE POLICY "anyone create appointments"
  ON public.appointments FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(btrim(patient_name)) BETWEEN 2 AND 120
    AND length(btrim(patient_phone)) BETWEEN 6 AND 32
    AND appointment_date >= current_date
  );

DROP POLICY IF EXISTS "anyone create med orders" ON public.medicine_orders;
CREATE POLICY "anyone create med orders"
  ON public.medicine_orders FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(btrim(patient_name)) BETWEEN 2 AND 120
    AND length(btrim(patient_phone)) BETWEEN 6 AND 32
  );
