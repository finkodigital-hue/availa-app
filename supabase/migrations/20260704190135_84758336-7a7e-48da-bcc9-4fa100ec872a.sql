ALTER TABLE public.bookings
DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
ADD CONSTRAINT bookings_status_check
CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'checked_in'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text, 'no_show'::text]));

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

DROP POLICY IF EXISTS "salon reads linked pro blocks" ON public.blocked_dates;
CREATE POLICY "salon reads linked pro blocks"
  ON public.blocked_dates FOR SELECT TO authenticated
  USING (public.salon_pro_permission(business_id, 'salon_can_view_calendar'));

DROP POLICY IF EXISTS "salon updates pro bookings" ON public.bookings;
CREATE POLICY "salon updates pro bookings"
  ON public.bookings FOR UPDATE TO authenticated
  USING (public.salon_pro_permission(business_id, 'salon_can_book_pros'))
  WITH CHECK (public.salon_pro_permission(business_id, 'salon_can_book_pros'));

DROP POLICY IF EXISTS "salon inserts pro bookings" ON public.bookings;
CREATE POLICY "salon inserts pro bookings"
  ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (public.salon_pro_permission(business_id, 'salon_can_book_pros'));
