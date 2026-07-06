
CREATE POLICY "anyone upload prescriptions" ON storage.objects
FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id = 'prescriptions');
CREATE POLICY "pharmacy staff read prescriptions" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'prescriptions' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacy')));
