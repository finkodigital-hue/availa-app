-- The "business-assets" storage bucket has had RLS policies referencing it
-- since 20260629232621, but nothing ever actually created the bucket row
-- itself (storage.buckets) — it only existed because someone created it by
-- hand in the Supabase dashboard on the original project. Any other project
-- (e.g. a fresh test account) that only ever ran the SQL migrations never
-- got the bucket, so every upload that targets it (staff photos, customer
-- photos, gallery images, white-label logo) fails client-side with
-- "Bucket not found". Mirrors how business-public-assets was created in
-- 20260716121000 — private (not public), served via signed URLs per the
-- existing policies.
INSERT INTO storage.buckets (id, name, public)
VALUES ('business-assets', 'business-assets', false)
ON CONFLICT (id) DO NOTHING;
