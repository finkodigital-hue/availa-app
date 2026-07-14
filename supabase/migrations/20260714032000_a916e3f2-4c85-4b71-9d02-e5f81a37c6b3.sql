-- Same OR-of-permissive-policies problem as get_portal_bookings(): customers
-- SELECT RLS OR-combines the customer's own email match with
-- is_business_owner(), which can't use the email index. The portal profile
-- page's unfiltered cross-business query was already measurably slow
-- (2+ seconds for ~10 rows) and would degrade the same way bookings did as
-- real customer volume grows. Fix proactively with the same pattern.
CREATE OR REPLACE FUNCTION public.get_portal_customer_records()
RETURNS TABLE(
  id uuid,
  business_id uuid,
  name text,
  email text,
  phone text,
  businesses jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    c.id, c.business_id, c.name, c.email, c.phone,
    jsonb_build_object('name', biz.name)
  FROM public.customers c
  LEFT JOIN public.businesses biz ON biz.id = c.business_id
  WHERE lower(c.email) = public.current_user_email()
  ORDER BY c.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_portal_customer_records() FROM public;
GRANT EXECUTE ON FUNCTION public.get_portal_customer_records() TO authenticated;
