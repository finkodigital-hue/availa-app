
-- 1. Services: buffers + colour
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS buffer_before_min int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buffer_after_min  int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS color text;

-- 2. Staff: soft-disable
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Hide non-active staff from public booking page (replace existing public read policies)
DROP POLICY IF EXISTS "public reads staff" ON public.staff;
DROP POLICY IF EXISTS "public reads staff authed" ON public.staff;
CREATE POLICY "public reads staff" ON public.staff FOR SELECT TO anon
  USING (bookable = true AND active = true);
CREATE POLICY "public reads staff authed" ON public.staff FOR SELECT TO authenticated
  USING ((bookable = true AND active = true) OR is_business_owner(business_id));

-- 3. Staff weekly hours
CREATE TABLE IF NOT EXISTS public.staff_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  open_time time,
  close_time time,
  closed boolean NOT NULL DEFAULT false,
  UNIQUE(staff_id, weekday)
);
GRANT SELECT ON public.staff_hours TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_hours TO authenticated;
GRANT ALL ON public.staff_hours TO service_role;
ALTER TABLE public.staff_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages staff_hours" ON public.staff_hours FOR ALL TO authenticated
  USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "public reads staff_hours" ON public.staff_hours FOR SELECT TO anon USING (true);
CREATE POLICY "public reads staff_hours authed" ON public.staff_hours FOR SELECT TO authenticated USING (true);

-- 4. Bookings: source + notify
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS notify_customer boolean NOT NULL DEFAULT true;
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_source_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_source_check
  CHECK (source IN ('online','walkin','manual'));

-- 5. Customers: phone_normalized + dedup indexes + auto-link trigger
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS phone_normalized text
    GENERATED ALWAYS AS (NULLIF(regexp_replace(COALESCE(phone,''), '\D', '', 'g'), '')) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS customers_business_email_lower_uniq
  ON public.customers (business_id, lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_business_phone_norm_uniq
  ON public.customers (business_id, phone_normalized) WHERE phone_normalized IS NOT NULL;

-- Extend handle_new_user to back-link existing customers with the same email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
    VALUES (new.id, COALESCE(new.raw_user_meta_data->>'full_name', new.email));
  UPDATE public.customers
     SET auth_user_id = new.id
   WHERE auth_user_id IS NULL
     AND email IS NOT NULL
     AND lower(email) = lower(new.email);
  RETURN new;
END $$;

-- 6. Merge customers RPC (owner-only)
CREATE OR REPLACE FUNCTION public.merge_customers(_winner uuid, _loser uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  bid uuid;
  loser_bid uuid;
  loser_notes text;
BEGIN
  SELECT business_id INTO bid FROM public.customers WHERE id = _winner;
  SELECT business_id, notes INTO loser_bid, loser_notes FROM public.customers WHERE id = _loser;
  IF bid IS NULL OR loser_bid IS NULL OR bid <> loser_bid THEN
    RAISE EXCEPTION 'Customers must belong to the same business';
  END IF;
  IF NOT public.is_business_owner(bid) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  UPDATE public.bookings SET customer_id = _winner WHERE customer_id = _loser;
  UPDATE public.customers
     SET notes = trim(both E'\n' from concat_ws(E'\n---\n', notes, loser_notes))
   WHERE id = _winner;
  DELETE FROM public.customers WHERE id = _loser;
END $$;
REVOKE ALL ON FUNCTION public.merge_customers(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.merge_customers(uuid, uuid) TO authenticated;

-- 7. Business media (gallery)
CREATE TABLE IF NOT EXISTS public.business_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('cover','logo','interior','team','portfolio')),
  path text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_media_biz_kind_idx ON public.business_media(business_id, kind, sort_order);
GRANT SELECT ON public.business_media TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_media TO authenticated;
GRANT ALL ON public.business_media TO service_role;
ALTER TABLE public.business_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages media" ON public.business_media FOR ALL TO authenticated
  USING (is_business_owner(business_id)) WITH CHECK (is_business_owner(business_id));
CREATE POLICY "public reads media" ON public.business_media FOR SELECT TO anon USING (true);
CREATE POLICY "public reads media authed" ON public.business_media FOR SELECT TO authenticated USING (true);

-- 8. Storage policies — owners can manage their own folder; public can read gallery objects
-- (bucket stays private; we use signed URLs for serving)
DROP POLICY IF EXISTS "owner uploads business assets" ON storage.objects;
DROP POLICY IF EXISTS "owner updates business assets" ON storage.objects;
DROP POLICY IF EXISTS "owner deletes business assets" ON storage.objects;
DROP POLICY IF EXISTS "owner reads business assets" ON storage.objects;
DROP POLICY IF EXISTS "anyone reads business assets" ON storage.objects;

CREATE POLICY "owner uploads business assets" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'business-assets'
    AND public.is_business_owner((string_to_array(name, '/'))[1]::uuid)
  );
CREATE POLICY "owner updates business assets" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'business-assets' AND public.is_business_owner((string_to_array(name, '/'))[1]::uuid));
CREATE POLICY "owner deletes business assets" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'business-assets' AND public.is_business_owner((string_to_array(name, '/'))[1]::uuid));
CREATE POLICY "owner reads business assets" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'business-assets' AND public.is_business_owner((string_to_array(name, '/'))[1]::uuid));
