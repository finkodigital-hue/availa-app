-- Non-cancelled booking count per customer, computed server-side. Used by
-- the customers list page's "visits" column — replaces both the correlated
-- per-row embedded count (pathological under RLS) and a client-side
-- paginated fetch-and-count over potentially tens of thousands of rows.
CREATE OR REPLACE FUNCTION public.customer_visit_counts(_business_id uuid)
RETURNS TABLE(customer_id uuid, visits bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.customer_id, count(*) AS visits
  FROM public.bookings b
  WHERE b.business_id = _business_id
    AND b.customer_id IS NOT NULL
    AND b.status <> 'cancelled'
    AND public.is_business_owner(_business_id)
  GROUP BY b.customer_id;
$$;

REVOKE ALL ON FUNCTION public.customer_visit_counts(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.customer_visit_counts(uuid) TO authenticated;
