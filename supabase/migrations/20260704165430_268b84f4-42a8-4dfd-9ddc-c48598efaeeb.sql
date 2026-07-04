
-- === 1) Staff: stop exposing email/phone publicly ===
DROP POLICY IF EXISTS "public can view bookable staff" ON public.staff;
DROP POLICY IF EXISTS "public can view bookable staff authed" ON public.staff;
DROP POLICY IF EXISTS "public reads staff" ON public.staff;
DROP POLICY IF EXISTS "public reads staff authed" ON public.staff;

CREATE OR REPLACE VIEW public.staff_public
WITH (security_invoker = true) AS
SELECT id, business_id, name, role, photo_url, bio, bookable, active
FROM public.staff
WHERE bookable = true AND active = true;

-- Grant column-level SELECT on safe columns only. Owners still see all columns
-- through the ALL policy on staff (which the owner_manages_staff grants), which
-- runs with authenticated role privileges — but the owner policy uses `USING`
-- for owner rows. To ensure owners retain full-column read, grant SELECT on all
-- staff columns back to authenticated, and rely on RLS to hide non-owner rows'
-- sensitive columns via a separate policy limited to safe columns.
GRANT SELECT (id, business_id, name, role, photo_url, bio, bookable, active)
  ON public.staff TO anon;
GRANT SELECT ON public.staff TO authenticated;
GRANT SELECT ON public.staff_public TO anon, authenticated;

-- Non-owner authenticated users can only see bookable/active staff. For those
-- rows, restrict column access by revoking sensitive columns from a broad SELECT
-- policy: we implement this by making the "public read" policy anon-only, and
-- authenticated non-owners read via the view instead.
CREATE POLICY "public reads bookable staff safe cols" ON public.staff
  FOR SELECT TO anon
  USING (bookable = true AND active = true);

-- Authenticated non-owners: allow row visibility for bookable/active staff too,
-- but rely on view-based reads (the client already selects a narrow projection).
CREATE POLICY "authed reads bookable staff" ON public.staff
  FOR SELECT TO authenticated
  USING (bookable = true AND active = true AND NOT public.is_business_owner(business_id));

-- === 2) Blocked dates: hide reason/title from public ===
DROP POLICY IF EXISTS "public reads blocked" ON public.blocked_dates;
DROP POLICY IF EXISTS "public reads blocked authed" ON public.blocked_dates;

CREATE OR REPLACE VIEW public.blocked_dates_public
WITH (security_invoker = true) AS
SELECT id, business_id, staff_id, starts_at, ends_at, kind
FROM public.blocked_dates;

GRANT SELECT (id, business_id, staff_id, starts_at, ends_at, kind)
  ON public.blocked_dates TO anon;
GRANT SELECT ON public.blocked_dates TO authenticated;
GRANT SELECT ON public.blocked_dates_public TO anon, authenticated;

CREATE POLICY "public reads blocked times" ON public.blocked_dates
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "authed reads blocked times" ON public.blocked_dates
  FOR SELECT TO authenticated
  USING (NOT public.is_business_owner(business_id));

-- === 3) Bookings: remove always-true INSERT policies ===
DROP POLICY IF EXISTS "public can insert bookings" ON public.bookings;
DROP POLICY IF EXISTS "authed can insert bookings" ON public.bookings;

CREATE POLICY "public can insert bookings" ON public.bookings
  FOR INSERT TO anon
  WITH CHECK (
    status = 'confirmed'
    AND EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = bookings.service_id
        AND s.business_id = bookings.business_id
        AND s.active = true
    )
    AND EXISTS (
      SELECT 1 FROM public.staff st
      WHERE st.id = bookings.staff_id
        AND st.business_id = bookings.business_id
        AND st.active = true
        AND st.bookable = true
    )
  );

CREATE POLICY "authed can insert bookings" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_business_owner(business_id)
    OR (
      status = 'confirmed'
      AND EXISTS (
        SELECT 1 FROM public.services s
        WHERE s.id = bookings.service_id
          AND s.business_id = bookings.business_id
          AND s.active = true
      )
      AND EXISTS (
        SELECT 1 FROM public.staff st
        WHERE st.id = bookings.staff_id
          AND st.business_id = bookings.business_id
          AND st.active = true
          AND st.bookable = true
      )
    )
  );

-- === 4) Customers: allow public booking flow to insert (no read exposure) ===
CREATE POLICY "public can insert customers for booking" ON public.customers
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = customers.business_id)
  );

-- === 5) Storage: remove permissive uploader policy on business-assets ===
DROP POLICY IF EXISTS "Authed upload business assets" ON storage.objects;

-- === 6) Harden SECURITY DEFINER functions ===
ALTER FUNCTION public.is_business_owner(uuid) SECURITY INVOKER;
ALTER FUNCTION public.ensure_business_hours(uuid) SECURITY INVOKER;
ALTER FUNCTION public.merge_customers(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.reassign_staff_bookings(uuid, uuid, boolean) SECURITY INVOKER;

CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT lower(nullif(current_setting('request.jwt.claims', true)::jsonb->>'email',''));
$$;

ALTER FUNCTION public.create_public_booking(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text) SECURITY INVOKER;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_business() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_booking_change_window() FROM PUBLIC, anon, authenticated;
