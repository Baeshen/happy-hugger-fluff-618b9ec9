
-- Helper: extract patient id from object path (first folder)
-- Path format: {patient_id}/{filename}

-- ============ lab-reports bucket ============
CREATE POLICY "Patient reads own lab files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'lab-reports' AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'doctor')
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.profile_id = auth.uid()
        AND (storage.foldername(name))[1] = p.id::text
    )
  )
);
CREATE POLICY "Admins manage lab files"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'lab-reports' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'doctor')))
WITH CHECK (bucket_id = 'lab-reports' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'doctor')));

-- ============ radiology-reports bucket ============
CREATE POLICY "Patient reads own radiology files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'radiology-reports' AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'doctor')
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.profile_id = auth.uid()
        AND (storage.foldername(name))[1] = p.id::text
    )
  )
);
CREATE POLICY "Admins manage radiology files"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'radiology-reports' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'doctor')))
WITH CHECK (bucket_id = 'radiology-reports' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'doctor')));

-- ============ invoice-pdfs bucket ============
CREATE POLICY "Patient reads own invoice files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'invoice-pdfs' AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.profile_id = auth.uid()
        AND (storage.foldername(name))[1] = p.id::text
    )
  )
);
CREATE POLICY "Admins manage invoice files"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'invoice-pdfs' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'invoice-pdfs' AND public.has_role(auth.uid(), 'admin'));

-- ============ second-opinion-uploads bucket ============
CREATE POLICY "Anyone can upload second opinion attachments"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id = 'second-opinion-uploads');
CREATE POLICY "Admins read second opinion attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'second-opinion-uploads' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage second opinion attachments"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'second-opinion-uploads' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'second-opinion-uploads' AND public.has_role(auth.uid(), 'admin'));
