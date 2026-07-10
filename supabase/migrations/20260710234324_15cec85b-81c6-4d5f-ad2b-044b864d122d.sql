
-- Replace the overly-permissive INSERT policy on second-opinion-uploads with
-- one that requires the upload path prefix to match a real, still-pending
-- second_opinion_requests row created within the last 30 minutes.
DROP POLICY IF EXISTS "Anyone can upload second opinion attachments" ON storage.objects;

CREATE POLICY "second opinion upload requires pending request"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'second-opinion-uploads'
  AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1
    FROM public.second_opinion_requests r
    WHERE r.id = ((storage.foldername(objects.name))[1])::uuid
      AND r.status = 'new'
      AND r.created_at > now() - interval '30 minutes'
  )
);
