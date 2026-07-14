-- The customer portal's "My bookings" query selected from public.bookings
-- with embedded businesses/services/staff and no business_id/staff_id
-- filter, relying entirely on RLS to scope it to the signed-in customer.
-- But bookings SELECT has three permissive policies for `authenticated`
-- OR'd together (customer email match, is_business_owner(), and
-- salon_pro_permission()) — the latter two can't use the customer_email
-- index, so Postgres must evaluate them per row across the whole
-- cross-tenant table. That was fine at toy data volume but now times out
-- (57014) with real appointment history in the table, breaking the portal
-- page for any real customer. Bypass the OR-of-policies problem with a
-- SECURITY DEFINER function that applies the one correct restriction
-- (matching the "Customers can view their bookings" policy) directly.
CREATE OR REPLACE FUNCTION public.get_portal_bookings()
RETURNS TABLE(
  id uuid,
  business_id uuid,
  service_id uuid,
  staff_id uuid,
  customer_email text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  price_cents int,
  notes text,
  businesses jsonb,
  services jsonb,
  staff jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    b.id, b.business_id, b.service_id, b.staff_id, b.customer_email,
    b.starts_at, b.ends_at, b.status, b.price_cents, b.notes,
    jsonb_build_object(
      'id', biz.id, 'name', biz.name, 'slug', biz.slug, 'address', biz.address,
      'brand_color', biz.brand_color, 'cancellation_window_hours', biz.cancellation_window_hours
    ),
    jsonb_build_object('id', sv.id, 'name', sv.name, 'duration_minutes', sv.duration_minutes),
    jsonb_build_object('id', st.id, 'name', st.name)
  FROM public.bookings b
  LEFT JOIN public.businesses biz ON biz.id = b.business_id
  LEFT JOIN public.services sv ON sv.id = b.service_id
  LEFT JOIN public.staff st ON st.id = b.staff_id
  WHERE lower(b.customer_email) = public.current_user_email()
  ORDER BY b.starts_at DESC
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.get_portal_bookings() FROM public;
GRANT EXECUTE ON FUNCTION public.get_portal_bookings() TO authenticated;
