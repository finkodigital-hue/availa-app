-- Public bucket objects are served by their direct CDN URLs without consulting
-- storage.objects RLS. Keep that public delivery behaviour, but do not allow an
-- anonymous caller to enumerate every salon's object names through the Storage
-- list API. Owners still need SELECT on their own rows for normal management.
DROP POLICY IF EXISTS "Public read business public assets" ON storage.objects;

DROP POLICY IF EXISTS "Owners read business public asset metadata" ON storage.objects;
CREATE POLICY "Owners read business public asset metadata" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'business-public-assets'
    AND (string_to_array(name, '/'))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND public.is_business_owner((string_to_array(name, '/'))[1]::uuid)
  );
