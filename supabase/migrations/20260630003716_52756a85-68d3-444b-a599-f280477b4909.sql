
CREATE POLICY "public reads business assets" ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'business-assets');
