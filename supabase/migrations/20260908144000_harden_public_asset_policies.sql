-- Public logos/favicons are intentionally readable, but authenticated users
-- must still only be able to write inside their own business folder. The
-- earlier bucket policy checked only the bucket name, allowing any signed-in
-- user to overwrite another salon's public branding if they guessed a path.
DROP POLICY IF EXISTS "Authed upload business public assets" ON storage.objects;
DROP POLICY IF EXISTS "Authed update own business public assets" ON storage.objects;
DROP POLICY IF EXISTS "Authed delete own business public assets" ON storage.objects;

CREATE POLICY "Owners upload business public assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'business-public-assets'
    AND (string_to_array(name, '/'))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND public.is_business_owner((string_to_array(name, '/'))[1]::uuid)
  );

CREATE POLICY "Owners update business public assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'business-public-assets'
    AND (string_to_array(name, '/'))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND public.is_business_owner((string_to_array(name, '/'))[1]::uuid)
  )
  WITH CHECK (
    bucket_id = 'business-public-assets'
    AND (string_to_array(name, '/'))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND public.is_business_owner((string_to_array(name, '/'))[1]::uuid)
  );

CREATE POLICY "Owners delete business public assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'business-public-assets'
    AND (string_to_array(name, '/'))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND public.is_business_owner((string_to_array(name, '/'))[1]::uuid)
  );
