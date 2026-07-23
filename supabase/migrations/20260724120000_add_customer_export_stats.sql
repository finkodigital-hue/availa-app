-- Aggregate per-customer stats for the client-list CSV export
-- (src/routes/_authenticated/customers.tsx). A business with ~1,000
-- customers can't afford an N+1 fetch-all-bookings-per-customer client
-- side, so this computes visits/spend/first/last visit in one indexed
-- GROUP BY, same shape and enforcement pattern as the existing
-- customer_visit_counts() (is_business_owner() ANDed into the WHERE
-- clause, so a non-owner caller gets an empty result set, not an error —
-- kept separate from that function rather than widening its return shape,
-- since customers.tsx's on-screen list already depends on its exact
-- {customer_id, visits} columns).
--
-- "Visit" matches the definition already used on-screen (customers.tsx's
-- CustomerDetailDialog, and customer_visit_counts itself): a non-cancelled
-- booking that has already happened. Upcoming bookings aren't visits yet.
CREATE OR REPLACE FUNCTION public.customer_export_stats(_business_id uuid)
RETURNS TABLE(
  customer_id uuid,
  visits bigint,
  total_spent_cents bigint,
  first_visit timestamptz,
  last_visit timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    b.customer_id,
    count(*) AS visits,
    coalesce(sum(b.price_cents), 0) AS total_spent_cents,
    min(b.starts_at) AS first_visit,
    max(b.starts_at) AS last_visit
  FROM public.bookings b
  WHERE b.business_id = _business_id
    AND b.customer_id IS NOT NULL
    AND b.status <> 'cancelled'
    AND b.starts_at < now()
    AND public.is_business_owner(_business_id)
  GROUP BY b.customer_id;
$$;
