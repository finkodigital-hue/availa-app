CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.is_salon_owner_of_pro(_pro_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.salon_professionals sp
    JOIN public.businesses b ON b.id = sp.salon_business_id
    WHERE sp.pro_business_id = _pro_business_id
      AND sp.status = 'active'
      AND b.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION private.salon_pro_permission(_pro_business_id uuid, _perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.salon_professionals sp
    JOIN public.businesses b ON b.id = sp.salon_business_id
    WHERE sp.pro_business_id = _pro_business_id
      AND sp.status = 'active'
      AND b.owner_id = auth.uid()
      AND COALESCE(
        (sp.permissions->>_perm)::boolean,
        CASE
          WHEN _perm = 'salon_can_book_pros' THEN COALESCE((sp.permissions->>'salon_can_book')::boolean, true)
          WHEN _perm = 'salon_can_move_pros' THEN COALESCE((sp.permissions->>'salon_can_move')::boolean, true)
          ELSE true
        END
      )
  );
$$;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_salon_owner_of_pro(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.salon_pro_permission(uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "salon reads linked pro business" ON public.businesses;
CREATE POLICY "salon reads linked pro business"
  ON public.businesses FOR SELECT TO authenticated
  USING (private.is_salon_owner_of_pro(id));

DROP POLICY IF EXISTS "salon reads linked pro staff" ON public.staff;
CREATE POLICY "salon reads linked pro staff"
  ON public.staff FOR SELECT TO authenticated
  USING (active = true AND private.salon_pro_permission(business_id, 'salon_can_view_calendar'));

DROP POLICY IF EXISTS "salon reads linked pro services" ON public.services;
CREATE POLICY "salon reads linked pro services"
  ON public.services FOR SELECT TO authenticated
  USING (active = true AND private.salon_pro_permission(business_id, 'salon_can_view_calendar'));

DROP POLICY IF EXISTS "salon reads linked pro bookings" ON public.bookings;
CREATE POLICY "salon reads linked pro bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (private.salon_pro_permission(business_id, 'salon_can_view_calendar'));

DROP POLICY IF EXISTS "salon updates pro bookings" ON public.bookings;
CREATE POLICY "salon updates pro bookings"
  ON public.bookings FOR UPDATE TO authenticated
  USING (private.salon_pro_permission(business_id, 'salon_can_book_pros'))
  WITH CHECK (private.salon_pro_permission(business_id, 'salon_can_book_pros'));

DROP POLICY IF EXISTS "salon inserts pro bookings" ON public.bookings;
CREATE POLICY "salon inserts pro bookings"
  ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (private.salon_pro_permission(business_id, 'salon_can_book_pros'));

DROP POLICY IF EXISTS "salon reads linked pro blocks" ON public.blocked_dates;
CREATE POLICY "salon reads linked pro blocks"
  ON public.blocked_dates FOR SELECT TO authenticated
  USING (private.salon_pro_permission(business_id, 'salon_can_view_calendar'));
