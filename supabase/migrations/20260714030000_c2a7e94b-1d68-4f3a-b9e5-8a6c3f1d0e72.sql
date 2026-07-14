-- customer_visit_counts previously counted every non-cancelled booking,
-- including future/upcoming ones, so the customers list "Visits" column
-- disagreed with the customer detail dialog (which only counts bookings
-- that have already happened). Align the two: a "visit" is a past
-- appointment, matching the client-side definition in customers.tsx.
CREATE OR REPLACE FUNCTION public.customer_visit_counts(_business_id uuid)
RETURNS TABLE(customer_id uuid, visits bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.customer_id, count(*) AS visits
  FROM public.bookings b
  WHERE b.business_id = _business_id
    AND b.customer_id IS NOT NULL
    AND b.status <> 'cancelled'
    AND b.starts_at < now()
    AND public.is_business_owner(_business_id)
  GROUP BY b.customer_id;
$$;
