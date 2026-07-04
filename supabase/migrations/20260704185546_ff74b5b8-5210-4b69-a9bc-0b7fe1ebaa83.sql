
-- Security-definer helper: does auth.uid() own a salon linked to this pro business?
CREATE OR REPLACE FUNCTION public.is_salon_owner_of_pro(_pro_business_id uuid)
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

CREATE OR REPLACE FUNCTION public.salon_pro_permission(_pro_business_id uuid, _perm text)
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
      AND COALESCE((sp.permissions->>_perm)::boolean, true)
  );
$$;

-- businesses
DROP POLICY IF EXISTS "salon reads linked pro business" ON public.businesses;
CREATE POLICY "salon reads linked pro business"
  ON public.businesses FOR SELECT
  USING (public.is_salon_owner_of_pro(id));

-- staff
DROP POLICY IF EXISTS "salon reads linked pro staff" ON public.staff;
CREATE POLICY "salon reads linked pro staff"
  ON public.staff FOR SELECT
  USING (active = true AND public.salon_pro_permission(business_id, 'salon_can_view_calendar'));

-- services
DROP POLICY IF EXISTS "salon reads linked pro services" ON public.services;
CREATE POLICY "salon reads linked pro services"
  ON public.services FOR SELECT
  USING (active = true AND public.salon_pro_permission(business_id, 'salon_can_view_calendar'));

-- bookings
DROP POLICY IF EXISTS "salon reads linked pro bookings" ON public.bookings;
CREATE POLICY "salon reads linked pro bookings"
  ON public.bookings FOR SELECT
  USING (public.salon_pro_permission(business_id, 'salon_can_view_calendar'));

DROP POLICY IF EXISTS "salon updates pro bookings" ON public.bookings;
CREATE POLICY "salon updates pro bookings"
  ON public.bookings FOR UPDATE
  USING (public.salon_pro_permission(business_id, 'salon_can_book_pros'));

DROP POLICY IF EXISTS "salon inserts pro bookings" ON public.bookings;
CREATE POLICY "salon inserts pro bookings"
  ON public.bookings FOR INSERT
  WITH CHECK (public.salon_pro_permission(business_id, 'salon_can_book_pros'));
