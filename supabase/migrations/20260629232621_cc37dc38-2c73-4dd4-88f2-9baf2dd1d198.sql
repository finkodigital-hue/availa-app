
CREATE POLICY "Public read business assets" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'business-assets');
CREATE POLICY "Authed upload business assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'business-assets');
CREATE POLICY "Authed update own business assets" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'business-assets' AND owner = auth.uid());
CREATE POLICY "Authed delete own business assets" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'business-assets' AND owner = auth.uid());
