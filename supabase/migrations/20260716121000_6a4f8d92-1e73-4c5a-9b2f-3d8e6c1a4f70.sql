
-- Public logo storage for the setup wizard / Design panel.
--
-- The existing `business-assets` bucket had its anon SELECT policy
-- deliberately removed (20260704200212, "remove blanket public read on
-- private bucket") — nothing in it is safe to expose to anonymous visitors.
-- theme.logoUrl, by contrast, is rendered directly with a plain <img> on the
-- public /book/:slug page, so it needs a bucket that's genuinely public.
-- Logos are non-sensitive, so a dedicated public bucket (rather than
-- reopening business-assets) keeps that earlier fix intact.
INSERT INTO storage.buckets (id, name, public)
VALUES ('business-public-assets', 'business-public-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read business public assets" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'business-public-assets');

CREATE POLICY "Authed upload business public assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'business-public-assets');

CREATE POLICY "Authed update own business public assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'business-public-assets' AND owner = auth.uid());

CREATE POLICY "Authed delete own business public assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'business-public-assets' AND owner = auth.uid());
