
CREATE TABLE public.clinic_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  phone text NOT NULL,
  phone_display text,
  mobile text,
  mobile_display text,
  whatsapp text,
  email text,
  address_ar text NOT NULL,
  address_en text NOT NULL,
  street_address text NOT NULL,
  address_locality text NOT NULL,
  address_region text NOT NULL,
  postal_code text,
  address_country text NOT NULL DEFAULT 'SA',
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  maps_url text,
  price_range text DEFAULT '$$',
  currencies_accepted text DEFAULT 'SAR',
  payment_accepted text DEFAULT 'Cash, Credit Card, Mada, Insurance',
  medical_specialties text[] NOT NULL DEFAULT ARRAY[
    'Cardiovascular','Dermatology','Pediatric','Obstetric','Dentistry',
    'InternalMedicine','Ophthalmologic','Otolaryngologic','Orthopedic'
  ],
  same_as text[] NOT NULL DEFAULT ARRAY[]::text[],
  opening_hours jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_settings_singleton CHECK (id = 1)
);

GRANT SELECT ON public.clinic_settings TO anon, authenticated;
GRANT ALL ON public.clinic_settings TO service_role;

ALTER TABLE public.clinic_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_settings_public_read"
ON public.clinic_settings FOR SELECT
USING (true);

CREATE POLICY "clinic_settings_admin_update"
ON public.clinic_settings FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER clinic_settings_set_updated_at
BEFORE UPDATE ON public.clinic_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.clinic_settings (
  id, name_ar, name_en, phone, phone_display, mobile, mobile_display, whatsapp, email,
  address_ar, address_en, street_address, address_locality, address_region, postal_code,
  address_country, lat, lng, maps_url, same_as, opening_hours
) VALUES (
  1,
  'مجمع باعشن الطبي',
  'Baeshen Medical Complex',
  '+966173274619',
  '017 327 4619',
  '+966598840764',
  '059 884 0764',
  '966598840764',
  'info@BaeshenMedical.sa',
  'جازان – صبيا – حي الظبية، طريق الملك عبدالعزيز',
  'Jazan – Sabya – Al-Dhabya, King Abdulaziz Rd',
  'King Abdulaziz Rd, Al-Dhabya',
  'Sabya',
  'Jazan',
  '85287',
  'SA',
  17.111364,
  42.654935,
  'https://www.google.com/maps?q=17.111364,42.654935',
  ARRAY[
    'https://instagram.com/bashen_medical',
    'https://tiktok.com/@bashen_medical',
    'https://x.com/bashen_medical'
  ],
  '[
    {"days":["Saturday","Sunday","Monday","Tuesday","Wednesday","Thursday"],"opens":"09:00","closes":"23:00"},
    {"days":["Friday"],"opens":"16:00","closes":"23:00"}
  ]'::jsonb
);
