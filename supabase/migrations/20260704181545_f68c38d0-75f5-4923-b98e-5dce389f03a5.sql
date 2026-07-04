-- Allow salon owner to see and manage linked independent pros' calendar data
-- while keeping revenue, customers, and reports private.

-- STAFF: salon reads linked pros' active staff
CREATE POLICY "salon reads linked pro staff"
ON public.staff FOR SELECT TO authenticated
USING (
  active = true AND EXISTS (
    SELECT 1 FROM public.salon_professionals sp
    JOIN public.businesses b ON b.id = sp.salon_business_id
    WHERE sp.pro_business_id = staff.business_id
      AND sp.status = 'active'
      AND b.owner_id = auth.uid()
      AND COALESCE((sp.permissions->>'salon_can_view_calendar')::boolean, true)
  )
);

-- SERVICES: salon reads linked pros' active services (so they can book them)
CREATE POLICY "salon reads linked pro services"
ON public.services FOR SELECT TO authenticated
USING (
  active = true AND EXISTS (
    SELECT 1 FROM public.salon_professionals sp
    JOIN public.businesses b ON b.id = sp.salon_business_id
    WHERE sp.pro_business_id = services.business_id
      AND sp.status = 'active'
      AND b.owner_id = auth.uid()
      AND COALESCE((sp.permissions->>'salon_can_view_calendar')::boolean, true)
  )
);

-- BOOKINGS: salon reads linked pros' bookings for shared calendar visibility
CREATE POLICY "salon reads linked pro bookings"
ON public.bookings FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.salon_professionals sp
    JOIN public.businesses b ON b.id = sp.salon_business_id
    WHERE sp.pro_business_id = bookings.business_id
      AND sp.status = 'active'
      AND b.owner_id = auth.uid()
      AND COALESCE((sp.permissions->>'salon_can_view_calendar')::boolean, true)
  )
);

-- BOOKINGS: salon inserts bookings into linked pros' businesses
CREATE POLICY "salon inserts pro bookings"
ON public.bookings FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.salon_professionals sp
    JOIN public.businesses b ON b.id = sp.salon_business_id
    WHERE sp.pro_business_id = bookings.business_id
      AND sp.status = 'active'
      AND b.owner_id = auth.uid()
      AND COALESCE((sp.permissions->>'salon_can_book_pros')::boolean, true)
  )
);

-- BOOKINGS: salon updates linked pros' bookings (drag/reschedule/status)
CREATE POLICY "salon updates pro bookings"
ON public.bookings FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.salon_professionals sp
    JOIN public.businesses b ON b.id = sp.salon_business_id
    WHERE sp.pro_business_id = bookings.business_id
      AND sp.status = 'active'
      AND b.owner_id = auth.uid()
      AND COALESCE((sp.permissions->>'salon_can_book_pros')::boolean, true)
  )
);

-- BLOCKED DATES: salon reads linked pros' blocks
CREATE POLICY "salon reads linked pro blocks"
ON public.blocked_dates FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.salon_professionals sp
    JOIN public.businesses b ON b.id = sp.salon_business_id
    WHERE sp.pro_business_id = blocked_dates.business_id
      AND sp.status = 'active'
      AND b.owner_id = auth.uid()
      AND COALESCE((sp.permissions->>'salon_can_view_calendar')::boolean, true)
  )
);

-- BUSINESSES: salon reads minimal fields of linked pros' businesses
-- (name is needed to label pros on the calendar).
CREATE POLICY "salon reads linked pro business"
ON public.businesses FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.salon_professionals sp
    JOIN public.businesses sb ON sb.id = sp.salon_business_id
    WHERE sp.pro_business_id = businesses.id
      AND sp.status = 'active'
      AND sb.owner_id = auth.uid()
  )
);